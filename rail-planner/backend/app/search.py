"""Direct and alternate route search.

Alternates are judged against a baseline: the fastest direct train (for time) and the
shortest direct train (for distance) between the exact stations asked for. If there is no
direct train, the best alternate found sets the baseline instead.

An alternate is kept when
    total_time     <= baseline_time + extra_hours
    total_distance <= baseline_km   + extra_km

Alternate types:
    nearby      a direct train from/to a station within `nearby_km` of the ones asked for
    connection  two trains with one change at a common station

Two data paths produce the same candidates:
    snapshot    the bundled open-data timetable, searched exhaustively (Sep 2024, with running days)
    live        RailRadar. The snapshot's network only suggests which stations are worth
                changing at; every train, time, distance and running day comes from the API.
"""

from __future__ import annotations

from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta

from .multileg import BoardLegs, SnapshotLegs, multi_search, suggest_multi_hubs
from .railradar import LegOption, LiveError, RailRadar, Usage, legs_from_boards
from .rules import IST, booking_windows, window_status
from .sleep import best_sleep, sleep_block
from .timetable import Station, StaticTimetable, Train, haversine_km

INF = float("inf")
LIVE_HUBS = 10  # change stations queried live (1 station-board request each, cached 7 days)
LIVE_NEARBY = 2  # nearby stations per side queried live (1 request each)
VIA_GROUP_MAX = 10  # stations per via buffer (busiest first)
LIVE_PINNED_NODES = 8  # halts of a pinned train added as change points in live mode (1 request each, cached)
LIVE_MULTI_HUBS = 8  # extra stations per side for 2+ changes (1 request each, cached)
SNAPSHOT_MULTI_HUBS = 15
TIGHT_CHANGE_MIN = 45  # changes shorter than this are flagged in the UI
DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


@dataclass
class SearchParams:
    from_code: str
    to_code: str
    journey_date: date
    extra_hours: float | None = 5.0  # None = no limit
    extra_km: float | None = 100.0  # None = no limit
    nearby_km: float = 15.0
    min_transfer_min: int = 20
    include_unreserved: bool = False
    limit: int = 50
    max_changes: int = 2
    min_sleep_hours: float | None = None  # None = don't care; else one train must allow this much sleep from 21-24h
    via: tuple[str, ...] = ()  # stations the route must pass through, in order
    via_stay_min: tuple[int, ...] = ()  # planned stop at each via station (minutes, 0 = just pass/change)
    via_radius_km: tuple[float, ...] = ()  # per via station: any station within this many km also counts
    max_wait_min: float | None = None  # longest wait at any change (on top of a planned stay); None = no limit
    offset: int = 0  # paging: skip this many sorted results (limit 0 = all)
    trains: tuple[str, ...] = ()  # only routes that use at least one of these trains (empty = any)
    depart_after: time | None = None  # leave no earlier than this on the journey date
    arrive_by: datetime | None = None  # reach the destination by this moment (IST)
    sort: str = "duration"  # duration | departure | arrival | distance | changes
    order: str = "asc"  # asc | desc
    kind: str = "all"  # all | direct | nearby | connection  (connection includes "through")

    @property
    def stays(self) -> dict[str, int]:
        return {c.upper(): m for c, m in zip(self.via, self.via_stay_min) if m > 0}

    @property
    def wait_cap(self) -> float:
        return INF if self.max_wait_min is None else self.max_wait_min

    @property
    def extra_min(self) -> float:
        return INF if self.extra_hours is None else self.extra_hours * 60

    @property
    def extra_dist(self) -> float:
        return INF if self.extra_km is None else self.extra_km


@dataclass
class Leg:
    train: Train | object  # anything with number, name, type, classes, reserved, runs_on
    from_code: str
    to_code: str
    dep: int  # minutes from 00:00 of the origin day, at the boarding station
    arr: int  # same clock, at the alighting station
    km: int
    board_date: date  # date the train leaves the boarding station
    passes: tuple[str, ...] = ()  # via stations passed without leaving this train

    @property
    def depart_at(self) -> datetime:
        return datetime.combine(self.board_date, time(0), IST) + timedelta(minutes=self.dep % 1440)

    @property
    def arrive_at(self) -> datetime:
        return self.depart_at + timedelta(minutes=self.arr - self.dep)

    @property
    def boarding_day_offset(self) -> int:
        return self.dep // 1440


@dataclass
class Journey:
    kind: str
    legs: list[Leg]
    tags: list[str] = field(default_factory=list)

    @property
    def depart_at(self) -> datetime:
        return self.legs[0].depart_at

    @property
    def arrive_at(self) -> datetime:
        return self.legs[-1].arrive_at

    @property
    def minutes(self) -> int:
        return int((self.arrive_at - self.depart_at).total_seconds() // 60)

    @property
    def km(self) -> int:
        return sum(leg.km for leg in self.legs)


def _runs(train, board_date: date, board_dep: int) -> bool:
    origin = board_date - timedelta(days=board_dep // 1440)
    return origin.weekday() in train.runs_on


def _eligible(train, p: SearchParams) -> bool:
    return p.include_unreserved or train.reserved


def _next_leg(opt: LegOption | tuple, ready: datetime) -> Leg | None:
    """First departure of this train at/after `ready`, honouring running days."""
    train, fc, tc, dep, arr, km = opt
    clock = timedelta(minutes=dep % 1440)
    day = ready.date()
    for _ in range(8):  # a weekly train can be up to 7 days away; the layover cap trims later
        when = datetime.combine(day, time(0), IST) + clock
        if when >= ready and _runs(train, day, dep):
            return Leg(train, fc, tc, dep, arr, km, day)
        day += timedelta(days=1)
    return None


# --------------------------------------------------------------------------- snapshot path


def _snap_leg(train: Train, i: int, j: int, day: date) -> Leg:
    a, b = train.stops[i], train.stops[j]
    return Leg(train, a.code, b.code, a.dep, b.arr, b.km - a.km, day)


def _departures(tt: StaticTimetable, origins: set[str], p: SearchParams, check_days: bool = True):
    for code in origins:
        for train, i in tt.trains_at(code):
            stop = train.stops[i]
            if stop.dep is None or not _eligible(train, p):
                continue
            if not check_days or _runs(train, p.journey_date, stop.dep):
                yield train, i


def _snap_direct(tt: StaticTimetable, origins: set[str], dests: set[str], p: SearchParams) -> list[Journey]:
    out = []
    for train, i in _departures(tt, origins, p):
        for j in range(i + 1, len(train.stops)):
            if train.stops[j].code in dests and train.stops[j].arr is not None:
                out.append(Journey("direct", [_snap_leg(train, i, j, p.journey_date)]))
                break  # first matching destination halt on this train
    return out


def _snap_connections(
    tt: StaticTimetable, origins: set[str], dests: set[str], p: SearchParams, km_cap: float, max_total: float = INF
) -> list[Journey]:
    origin, dest = p.from_code, p.to_code
    # Index every train that reaches a destination: transfer station -> [(train, idx_at_transfer, idx_at_dest)]
    feeders: dict[str, list[tuple[Train, int, int]]] = {}
    for code in dests:
        for train, j in tt.trains_at(code):
            if train.stops[j].arr is None or not _eligible(train, p):
                continue
            for k in range(j - 1, -1, -1):
                s = train.stops[k]
                if s.code in origins:
                    break  # earlier halts are before the origin: that part is a direct train
                if s.dep is not None and s.code not in dests:
                    feeders.setdefault(s.code, []).append((train, k, j))

    best: dict[tuple[str, str], Journey] = {}
    for t1, i in _departures(tt, origins, p):
        if any(s.code in dests for s in t1.stops[i + 1 :]):
            continue  # already a direct train; no point changing
        leg1_start = t1.stops[i]
        for x in range(i + 1, len(t1.stops)):
            stop_x = t1.stops[x]
            if stop_x.arr is None or stop_x.code not in feeders:
                continue
            km1 = stop_x.km - leg1_start.km
            if km1 > km_cap:
                break
            leg1 = _snap_leg(t1, i, x, p.journey_date)
            ready = leg1.arrive_at + timedelta(minutes=p.min_transfer_min)
            for t2, k, j in feeders[stop_x.code]:
                if t2.number == t1.number:
                    continue
                if km1 + t2.stops[j].km - t2.stops[k].km > km_cap:
                    continue
                s2k, s2j = t2.stops[k], t2.stops[j]
                leg2 = _next_leg((t2, s2k.code, s2j.code, s2k.dep, s2j.arr, s2j.km - s2k.km), ready)
                if leg2 is None or _minutes(leg1.depart_at, leg2.arrive_at) > max_total:
                    continue
                if _minutes(leg1.arrive_at, leg2.depart_at) > p.wait_cap:
                    continue
                _keep_best(best, Journey("connection", [leg1, leg2]), origin, dest)
    return list(best.values())


def _max_total(direct: list[Journey], p: SearchParams) -> float:
    """Longest door-to-door time worth building while searching: fastest direct + tolerance (or unlimited)."""
    return min(j.minutes for j in direct) + p.extra_min if direct else INF


def _minutes(a: datetime, b: datetime) -> float:
    return (b - a).total_seconds() / 60


def _keep_best(best: dict, j: Journey, origin: str, dest: str) -> None:
    """One journey per train pair: earliest arrival, then the stations actually asked for, then later departure."""
    t1, t2 = j.legs[0].train.number, j.legs[1].train.number
    key = (t1.split("-")[0], t2.split("-")[0])  # fold slip coaches into their parent

    def score(x: Journey):
        return (x.arrive_at, x.legs[0].from_code != origin, x.legs[-1].to_code != dest, -x.depart_at.timestamp())

    cur = best.get(key)
    if cur is None or score(j) < score(cur):
        best[key] = j


def _snapshot_candidates(tt, a, b, origins, dests, p, km_cap_fn):
    all_direct = _snap_direct(tt, origins, dests, p)
    direct = [j for j in all_direct if j.legs[0].from_code == a.code and j.legs[-1].to_code == b.code]
    km_cap = km_cap_fn(direct)
    return direct, all_direct, _snap_connections(tt, origins, dests, p, km_cap, _max_total(direct, p))


def suggest_hubs(
    tt: StaticTimetable, a: Station, b: Station, p: SearchParams, k: int = LIVE_HUBS
) -> list[str]:
    """Change stations worth asking the live API about.

    Uses only the network's shape (which trains link which stations, and how far), never the
    snapshot's clock times: those are years old, and a connection that looked impossible then
    (e.g. Basava -> Hutatma at Solapur) can be the best one today. Stations are ranked by how
    many first-leg x second-leg train pairs meet there, within the distance tolerance.
    """
    origins = {a.code, *(s.code for s, _ in tt.nearby(a.code, p.nearby_km))}
    dests = {b.code, *(s.code for s, _ in tt.nearby(b.code, p.nearby_km))}

    reach: dict[str, dict[str, int]] = {}  # hub -> {train: km from an origin}
    direct_km = []
    for o in origins:
        for t, i in tt.trains_at(o):
            start = t.stops[i]
            if start.dep is None or not t.reserved:
                continue
            for s in t.stops[i + 1 :]:
                if s.arr is None:
                    continue
                if s.code in dests:
                    direct_km.append(s.km - start.km)
                    break
                reach.setdefault(s.code, {})
                reach[s.code][t.number] = min(s.km - start.km, reach[s.code].get(t.number, 10**9))

    feed: dict[str, dict[str, int]] = {}  # hub -> {train: km to a destination}
    for d in dests:
        for t, j in tt.trains_at(d):
            end = t.stops[j]
            if end.arr is None or not t.reserved:
                continue
            for s in reversed(t.stops[:j]):
                if s.code in origins:
                    break
                if s.dep is None:
                    continue
                feed.setdefault(s.code, {})
                feed[s.code][t.number] = min(end.km - s.km, feed[s.code].get(t.number, 10**9))

    base_km = min(direct_km) if direct_km else haversine_km(a, b) * 1.6
    too_close = max(p.nearby_km, 10) + 5  # covered by the nearby-station check
    ranked = []
    for code in reach.keys() & feed.keys():
        st = tt.station(code)
        if not st or min(haversine_km(st, a), haversine_km(st, b)) <= too_close:
            continue
        detour = min(reach[code].values()) + min(feed[code].values())
        if detour > base_km + p.extra_dist:
            continue
        ranked.append((-len(reach[code]) * len(feed[code]), detour, code))
    ranked.sort()
    return [code for *_, code in ranked[:k]]


# --------------------------------------------------------------------------- live path


def _live_candidates(tt, live: RailRadar, a, b, near_a, near_b, p, usage: Usage, warnings: list[str], extra=()):
    """One station-board request per station; every leg comes from intersecting two boards."""
    origin, dest = a.code, b.code
    hubs = suggest_hubs(tt, a, b, p)
    from_codes = [a.code, *sorted(near_a, key=tt.reserved_halts, reverse=True)[:LIVE_NEARBY]]
    to_codes = [b.code, *sorted(near_b, key=tt.reserved_halts, reverse=True)[:LIVE_NEARBY]]

    def fetch(code):
        try:
            return code, live.station_board(code, usage)
        except LiveError as e:
            if code in (a.code, b.code):
                raise
            return code, e

    with ThreadPoolExecutor(max_workers=6) as pool:
        boards = dict(pool.map(fetch, dict.fromkeys([*from_codes, *to_codes, *hubs, *extra])))

    failed = [c for c, v in boards.items() if isinstance(v, LiveError)]
    if failed:
        warnings.append(f"Live data unavailable for {', '.join(failed[:5])}")
    boards = {c: v for c, v in boards.items() if not isinstance(v, LiveError)}
    from_codes = [c for c in from_codes if c in boards]
    to_codes = [c for c in to_codes if c in boards]
    hubs = [h for h in hubs if h in boards]

    def legs(x, y):
        return [o for o in legs_from_boards(boards[x], boards[y]) if _eligible(o.train, p)]

    def board_today(o: LegOption) -> Leg | None:
        if not _runs(o.train, p.journey_date, o.dep):
            return None
        return Leg(o.train, o.from_code, o.to_code, o.dep, o.arr, o.km, p.journey_date)

    all_direct: list[Journey] = []
    through: set[str] = set()  # trains that already run origin-side -> destination-side
    for x in from_codes:
        for y in to_codes:
            for o in legs(x, y):
                through.add(o.train.number)
                if leg := board_today(o):
                    all_direct.append(Journey("direct", [leg]))
    direct = [j for j in all_direct if j.legs[0].from_code == a.code and j.legs[-1].to_code == b.code]

    max_total = _max_total(direct, p)
    best: dict[tuple[str, str], Journey] = {}
    for h in hubs:
        firsts = [o for x in from_codes for o in legs(x, h) if o.train.number not in through]
        seconds = [o for y in to_codes for o in legs(h, y) if o.train.number not in through]
        for o1 in firsts:
            leg1 = board_today(o1)
            if not leg1:
                continue
            ready = leg1.arrive_at + timedelta(minutes=p.min_transfer_min)
            for o2 in seconds:
                if o2.train.number == o1.train.number:
                    continue
                leg2 = _next_leg((o2.train, o2.from_code, o2.to_code, o2.dep, o2.arr, o2.km), ready)
                if leg2 is None or _minutes(leg1.depart_at, leg2.arrive_at) > max_total:
                    continue
                if _minutes(leg1.arrive_at, leg2.depart_at) > p.wait_cap:
                    continue
                _keep_best(best, Journey("connection", [leg1, leg2]), origin, dest)
    return direct, all_direct, list(best.values()), boards


# --------------------------------------------------------------------------- entry point


def search(tt: StaticTimetable, p: SearchParams, live: RailRadar | None = None) -> dict:
    a, b = tt.station(p.from_code), tt.station(p.to_code)
    if not a or not b:
        raise ValueError("Unknown station code")
    if a.code == b.code:
        raise ValueError("Origin and destination are the same")

    near_a = {s.code: d for s, d in tt.nearby(a.code, p.nearby_km)}
    near_b = {s.code: d for s, d in tt.nearby(b.code, p.nearby_km)}
    origins = {a.code, *near_a}
    dests = {b.code, *near_b}
    straight = haversine_km(a, b)

    def km_cap(direct: list[Journey]) -> float:
        # rail routes rarely exceed ~1.5x the crow-fly distance
        return (min(j.km for j in direct) if direct else straight * 1.6) + p.extra_dist

    via = [c.upper() for c in p.via if c]
    for c in via:
        if not tt.station(c):
            raise ValueError(f"Unknown via station {c}")
        if c in (a.code, b.code):
            raise ValueError("Via stations must differ from origin and destination")
    pinned = {t.strip() for t in p.trains if t.strip()}
    # Stations on a pinned train become candidate change points, so routes built around it are found,
    # not just filtered out of whatever the usual hubs produced.
    pinned_nodes = _pinned_nodes(tt, pinned, origins | dests, cap=LIVE_PINNED_NODES if live else None)
    # Via point i is satisfied by its station or any station within its km buffer.
    radii = list(p.via_radius_km) + [0.0] * len(via)
    via_groups: list[list[str]] = []
    for code, r in zip(via, radii):
        members = [code]
        if r > 0:
            members += [s.code for s, _ in tt.nearby(code, r, min_halts=1, limit=VIA_GROUP_MAX)
                        if s.code not in (a.code, b.code)]
        via_groups.append(members)
    stays = {m: p.stays.get(g[0], 0) for g in via_groups for m in g if p.stays.get(g[0], 0) > 0}
    via_members = [m for g in via_groups for m in g]
    multi_wanted = p.max_changes >= 2 or bool(via) or (bool(pinned) and p.max_changes >= 1)
    multi_hubs: list[str] = []
    if multi_wanted:
        k = LIVE_MULTI_HUBS if live else SNAPSHOT_MULTI_HUBS
        multi_hubs = suggest_multi_hubs(tt, origins, dests, a, b, k) if p.max_changes >= 2 else []
    multi_hubs = list(dict.fromkeys([*multi_hubs, *pinned_nodes]))

    usage, warnings = Usage(), []
    source, boards = "snapshot", None
    if live:
        try:
            direct, all_direct, connections, boards = _live_candidates(
                tt, live, a, b, near_a, near_b, p, usage, warnings, extra=[*via_members, *multi_hubs]
            )
            source = "live"
        except LiveError as e:
            warnings.append(f"{e}. Showing the offline snapshot instead.")
    if source == "snapshot":
        direct, all_direct, connections = _snapshot_candidates(tt, a, b, origins, dests, p, km_cap)

    direct_trains = {j.legs[0].train.number for j in direct}
    nearby = _best_per_train([j for j in all_direct if j.legs[0].train.number not in direct_trains])
    for j in nearby:
        j.kind = "nearby"

    base_min = min((j.minutes for j in direct), default=None)
    base_km = min((j.km for j in direct), default=None)
    if base_min is None:
        pool = nearby + connections
        if pool:
            base_min = min(j.minutes for j in pool)
            base_km = min(j.km for j in pool)

    multi: list[Journey] = []
    via_beyond = None
    relaxed = None
    if multi_wanted:
        if source == "live":
            src = BoardLegs(boards, lambda t: _eligible(t, p))
            nodes = [n for n in [*origins, *dests, *suggest_hubs(tt, a, b, p), *multi_hubs, *via_members] if n in boards]
            starts = [c for c in origins if c in boards]
        else:
            src = SnapshotLegs(tt, lambda t: _eligible(t, p))
            nodes = [*origins, *dests, *suggest_hubs(tt, a, b, p, k=SNAPSHOT_MULTI_HUBS), *multi_hubs, *via_members]
            starts = list(origins)
        planned = sum(p.stays.values())  # your planned stops don't count against the extra-time limit
        max_total = INF if base_min is None else base_min + p.extra_min + planned
        max_km = INF if base_km is None else base_km + p.extra_dist

        earliest_dep = p.depart_after.hour * 60 + p.depart_after.minute if p.depart_after else 0
        latest_arr = (
            (p.arrive_by - datetime.combine(p.journey_date, time(0), IST)).total_seconds() / 60 if p.arrive_by else INF
        )

        def run_multi(t_cap, km_cap_, wait_cap=p.wait_cap):
            return multi_search(
                src, tt, nodes, starts, dests, b, p.journey_date, p.max_changes, p.min_transfer_min, via,
                t_cap, km_cap_,
                make_leg=lambda o, day: Leg(o.train, o.from_code, o.to_code, o.dep, o.arr, o.km, day),
                via_stays=stays,
                via_groups=[set(g) for g in via_groups],
                earliest_dep=earliest_dep,
                latest_arr=latest_arr,
                max_wait_min=wait_cap,
            )

        found = run_multi(max_total, max_km)
        relaxed = lambda: run_multi(INF, INF, INF)  # noqa: E731
        if via and not found and (max_total < INF or max_km < INF or p.wait_cap < INF):
            # Nothing fits the limits: look without them so the UI can say what's out there.
            beyond = [r for r in run_multi(INF, INF, INF) if len(r.legs) > 1 or via]
            if beyond:
                durations = [
                    (r.legs[-1].arrive_at - r.legs[0].depart_at).total_seconds() / 60 for r in beyond
                ]
                unique = {tuple(l.train.number for l in r.legs) for r in beyond}
                via_beyond = {"count": len(unique), "fastest_minutes": int(min(durations))}
        best: dict[tuple, Journey] = {}
        for r in found:
            if len(r.legs) == 1 and not via:
                continue  # plain direct trains are already listed
            j = Journey("connection" if len(r.legs) > 1 else "through", r.legs, tags=list(via))
            key = tuple(l.train.number.split("-")[0] for l in j.legs)
            cur = best.get(key)
            if cur is None or (j.arrive_at, j.km) < (cur.arrive_at, cur.km):
                best[key] = j
        multi = list(best.values())
        if base_min is None and multi:
            base_min = min(j.minutes for j in multi)
            base_km = min(j.km for j in multi)

    if via:
        pool = multi  # every alternate must pass the via stations
    elif p.max_changes == 0:
        pool = nearby
    else:
        seen = {tuple(l.train.number for l in j.legs) for j in connections}
        pool = nearby + connections + [j for j in multi if tuple(l.train.number for l in j.legs) not in seen]

    alternates: list[Journey] = []
    max_min_used = INF
    if base_min is not None:
        max_min = base_min + p.extra_min + (sum(p.stays.values()) if via else 0)
        max_min_used = max_min
        max_km = base_km + p.extra_dist
        alternates = [j for j in pool if j.minutes <= max_min and j.km <= max_km]
    kept = set(map(id, alternates))
    over = [j for j in pool if id(j) not in kept] if base_min is not None else []
    if pinned:  # only count what the pinned trains would have added
        over = [j for j in over if any(l.train.number in pinned for l in j.legs)]
    hidden_by_limits = len(over)
    fastest_hidden = min((j.minutes for j in over), default=None)
    if via_beyond:
        hidden_by_limits += via_beyond["count"]
        fastest_hidden = via_beyond["fastest_minutes"]

    alternates.sort(key=lambda j: (j.minutes, j.km))
    # With via stations every route shares the same change points, so variety caps would only hide them.
    hidden_by_sleep = 0
    if p.min_sleep_hours is not None:
        before = len(direct) + len(alternates)
        direct = [j for j in direct if sleep_block(j.legs, p.min_sleep_hours)]
        alternates = [j for j in alternates if sleep_block(j.legs, p.min_sleep_hours)]
        hidden_by_sleep = before - len(direct) - len(alternates)

    # One list, sorted and filtered here over *every* route found, then cut to the page size.
    # With via stations, only routes through them are listed; direct trains still set the time baseline.
    everything = alternates if via else direct + alternates
    # Time window: leave no earlier than / reach by. (The multi-change search already prunes to it,
    # so there's no meaningful "hidden" count; the page just says when nothing fits.)
    if p.depart_after or p.arrive_by:
        day0 = datetime.combine(p.journey_date, time(0), IST)
        lo = day0 + timedelta(hours=p.depart_after.hour, minutes=p.depart_after.minute) if p.depart_after else None
        everything = [
            j for j in everything
            if (lo is None or j.depart_at >= lo) and (p.arrive_by is None or j.arrive_at <= p.arrive_by)
        ]
    if pinned:
        everything = [j for j in everything if any(l.train.number in pinned for l in j.legs)]
        limited = max_min_used < INF or p.extra_km is not None or p.wait_cap < INF
        if not everything and relaxed and limited and not hidden_by_limits:
            # Nothing with the pinned train fits the limits: count what exists beyond them.
            beyond = [r for r in relaxed() if any(l.train.number in pinned for l in r.legs)]
            if beyond:
                hidden_by_limits = len({tuple(l.train.number for l in r.legs) for r in beyond})
                fastest_hidden = int(min((r.legs[-1].arrive_at - r.legs[0].depart_at).total_seconds() / 60 for r in beyond))
    counts = {
        "all": len(everything),
        "direct": sum(j.kind == "direct" for j in everything),
        "nearby": sum(j.kind == "nearby" for j in everything),
        "connection": sum(j.kind in ("connection", "through") for j in everything),
    }
    chosen = [j for j in everything if _kind_matches(j, p.kind)]
    chosen.sort(key=_sort_key(p.sort, p.order))
    total = len(chosen)
    # Strict order the user asked for, every route reachable by paging (no variety caps dropping routes).
    results = chosen[p.offset :] if p.limit == 0 else chosen[p.offset : p.offset + p.limit]

    now = datetime.now(IST)
    return {
        "from": _station(a),
        "to": _station(b),
        "journey_date": p.journey_date.isoformat(),
        "params": {
            "extra_hours": p.extra_hours,
            "extra_km": p.extra_km,
            "nearby_km": p.nearby_km,
            "min_transfer_min": p.min_transfer_min,
            "include_unreserved": p.include_unreserved,
            "max_changes": p.max_changes,
            "min_sleep_hours": p.min_sleep_hours,
            "via": list(p.via),
            "via_groups": [
                {"code": g[0], "radius_km": r, "stations": [{"code": c, "name": _name(tt, c)} for c in g]}
                for g, r in zip(via_groups, radii)
            ],
            "via_stay_min": list(p.via_stay_min),
            "max_wait_min": p.max_wait_min,
            "trains": sorted(pinned),
            "depart_after": p.depart_after.strftime("%H:%M") if p.depart_after else None,
            "arrive_by": p.arrive_by.isoformat() if p.arrive_by else None,
        },
        "data_source": {
            "kind": source,
            "provider": "RailRadar" if source == "live" else tt.meta.get("source"),
            "as_of": None if source == "live" else tt.meta.get("as_of"),
            "run_days": True if source == "live" else bool(tt.meta.get("run_days")),
            "live_configured": live is not None,
            "requests": usage.requests,
            "cache_hits": usage.cache_hits,
            "month_requests": live.month_requests() if live else None,
            "warnings": warnings,
        },
        "hidden_by_limits": hidden_by_limits,
        "hidden_by_sleep": hidden_by_sleep,
        "fastest_hidden_minutes": fastest_hidden,
        "baseline": None
        if base_min is None
        else {
            "minutes": base_min,
            "km": base_km,
            "source": "direct" if direct else "best_alternate",
            "max_minutes": None if p.extra_hours is None else base_min + p.extra_min + (sum(p.stays.values()) if via else 0),
            "planned_stay_minutes": sum(p.stays.values()) if via else 0,
            "max_km": None if p.extra_km is None else base_km + p.extra_dist,
        },
        "nearby_stations": {
            "from": [{"code": c, "name": tt.station(c).name, "distance_km": round(d, 1)} for c, d in near_a.items()],
            "to": [{"code": c, "name": tt.station(c).name, "distance_km": round(d, 1)} for c, d in near_b.items()],
        },
        "sort": {"by": p.sort, "order": p.order, "kind": p.kind},
        "counts": counts,
        "total": total,
        "offset": p.offset,
        "limit": p.limit,
        "results": [_journey(tt, j, base_min, base_km, now, near_a, near_b, p.min_sleep_hours, stays) for j in results],
    }


def _pinned_nodes(tt: StaticTimetable, pinned: set[str], ends: set[str], cap: int | None) -> list[str]:
    """Halts of the pinned trains (busiest first when capped, e.g. to limit live requests)."""
    codes: list[str] = []
    for n in pinned:
        t = tt.train(n)
        if t:
            codes += [s.code for s in t.stops if s.code not in ends]
    codes = list(dict.fromkeys(codes))
    if cap is not None:
        codes = sorted(codes, key=tt.reserved_halts, reverse=True)[:cap]
    return codes


SORTS = ("duration", "departure", "arrival", "distance", "changes")
KINDS = ("all", "direct", "nearby", "connection")


def _kind_matches(j: Journey, kind: str) -> bool:
    if kind == "all":
        return True
    if kind == "connection":
        return j.kind in ("connection", "through")
    return j.kind == kind


def _sort_key(by: str, order: str):
    """Main key flips with the order; ties always fall back to fastest, then shortest."""
    sign = -1 if order == "desc" else 1

    def main(j: Journey) -> float:
        if by == "departure":
            return j.depart_at.timestamp()
        if by == "arrival":
            return j.arrive_at.timestamp()
        if by == "distance":
            return j.km
        if by == "changes":
            return len(j.legs) - 1
        return j.minutes

    return lambda j: (sign * main(j), j.minutes, j.km)


def _best_per_train(items: list[Journey]) -> list[Journey]:
    best: dict[str, Journey] = {}
    for j in items:
        n = j.legs[0].train.number
        if n not in best or j.minutes < best[n].minutes:
            best[n] = j
    return list(best.values())


def _station(s: Station) -> dict:
    return {"code": s.code, "name": s.name, "state": s.state, "lat": s.lat, "lon": s.lon}


def _name(tt: StaticTimetable, code: str) -> str:
    s = tt.station(code)
    return s.name if s else code


def _journey(tt, j: Journey, base_min, base_km, now, near_a, near_b, sleep_hours=None, stays=None) -> dict:
    first, last = j.legs[0], j.legs[-1]
    out = {
        "kind": j.kind,
        "depart_at": j.depart_at.isoformat(),
        "arrive_at": j.arrive_at.isoformat(),
        "minutes": j.minutes,
        "km": j.km,
        "extra_minutes": None if base_min is None else j.minutes - base_min,
        "extra_km": None if base_km is None else j.km - base_km,
        "legs": [_leg(tt, leg, now) for leg in j.legs],
        "transfer": None,
        "access": {
            "board_offset_km": round(near_a.get(first.from_code, 0), 1),
            "alight_offset_km": round(near_b.get(last.to_code, 0), 1),
        },
    }
    transfers = []
    for x, y in zip(j.legs, j.legs[1:]):
        wait = int((y.depart_at - x.arrive_at).total_seconds() // 60)
        stay = (stays or {}).get(x.to_code, 0)
        transfers.append(
            {
                "station": {"code": x.to_code, "name": _name(tt, x.to_code)},
                "wait_minutes": wait,
                "planned_stay_minutes": stay,
                "tight": stay == 0 and wait < TIGHT_CHANGE_MIN,  # a planned stop isn't a tight connection
            }
        )
    out["transfers"] = transfers
    out["changes"] = len(transfers)
    out["transfer"] = transfers[0] if transfers else None
    out["via"] = [{"code": c, "name": _name(tt, c)} for c in j.tags]
    block = sleep_block(j.legs, sleep_hours) if sleep_hours is not None else None
    out["sleep"] = (
        {"leg": block["leg"], "train": block["train"], "start": block["start"].isoformat(), "end": block["end"].isoformat(),
         "hours": sleep_hours}
        if block else None
    )
    out["max_sleep_minutes"] = int(best_sleep(j.legs).total_seconds() // 60)
    return out


def _leg(tt, leg: Leg, now: datetime) -> dict:
    t = leg.train
    windows = []
    if t.reserved:
        for w in booking_windows(leg.board_date, leg.boarding_day_offset, list(t.classes)):
            windows.append(
                {
                    "kind": w.kind,
                    "label": w.label,
                    "opens_at": w.opens_at.isoformat(),
                    "status": window_status(w.opens_at, leg.depart_at, now),
                    "classes": w.classes,
                    "note": w.note,
                }
            )
    return {
        "train": {
            "number": t.number,
            "name": t.name,
            "type": t.type,
            "classes": list(t.classes),
            "reserved": t.reserved,
            "runs_on": [DAY_NAMES[d] for d in sorted(t.runs_on)],
        },
        "passes": [{"code": c, "name": _name(tt, c)} for c in leg.passes],
        "from": {"code": leg.from_code, "name": _name(tt, leg.from_code)},
        "to": {"code": leg.to_code, "name": _name(tt, leg.to_code)},
        "depart_at": leg.depart_at.isoformat(),
        "arrive_at": leg.arrive_at.isoformat(),
        "minutes": leg.arr - leg.dep,
        "km": leg.km,
        "origin_date": (leg.board_date - timedelta(days=leg.boarding_day_offset)).isoformat(),
        "booking_windows": windows,
    }
