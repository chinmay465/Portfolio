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
    snapshot    the bundled open-data timetable, searched exhaustively (stale; every train daily)
    live        RailRadar. The snapshot's network only suggests which stations are worth
                changing at; every train, time, distance and running day comes from the API.
"""

from __future__ import annotations

from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta

from .railradar import LegOption, LiveError, RailRadar, Usage
from .rules import IST, booking_windows, window_status
from .timetable import Station, StaticTimetable, Train, haversine_km

MAX_LAYOVER_MIN = 12 * 60  # hard cap while collecting candidates, before tolerance filtering
LIVE_HUBS = 6  # change stations queried live (2 requests each)
LIVE_NEARBY = 2  # nearby stations per side queried live (1 request each)
DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


@dataclass
class SearchParams:
    from_code: str
    to_code: str
    journey_date: date
    extra_hours: float = 3.0
    extra_km: float = 150.0
    nearby_km: float = 15.0
    min_transfer_min: int = 45
    include_unreserved: bool = False
    limit: int = 25


@dataclass
class Leg:
    train: Train | object  # anything with number, name, type, classes, reserved, runs_on
    from_code: str
    to_code: str
    dep: int  # minutes from 00:00 of the origin day, at the boarding station
    arr: int  # same clock, at the alighting station
    km: int
    board_date: date  # date the train leaves the boarding station

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
    tt: StaticTimetable, origins: set[str], dests: set[str], p: SearchParams, km_cap: float
) -> list[Journey]:
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
                if leg2 is None or (leg2.depart_at - leg1.arrive_at).total_seconds() / 60 > MAX_LAYOVER_MIN:
                    continue
                _keep_best(best, Journey("connection", [leg1, leg2]))
    return list(best.values())


def _keep_best(best: dict, j: Journey) -> None:
    t1, t2 = j.legs[0].train.number, j.legs[1].train.number
    key = (t1.split("-")[0], t2.split("-")[0])  # fold slip coaches into their parent
    cur = best.get(key)
    if cur is None or (j.arrive_at, -j.depart_at.timestamp()) < (cur.arrive_at, -cur.depart_at.timestamp()):
        best[key] = j


def _snapshot_candidates(tt, a, b, origins, dests, p, km_cap_fn):
    all_direct = _snap_direct(tt, origins, dests, p)
    direct = [j for j in all_direct if j.legs[0].from_code == a.code and j.legs[-1].to_code == b.code]
    km_cap = km_cap_fn(direct)
    return direct, all_direct, _snap_connections(tt, origins, dests, p, km_cap)


def suggest_hubs(tt: StaticTimetable, a: Station, b: Station, p: SearchParams, k: int = LIVE_HUBS) -> list[str]:
    """Change stations worth asking the live API about, ranked by how many snapshot routes use them."""
    loose = SearchParams(
        a.code, b.code, p.journey_date, p.extra_hours + 3, p.extra_km + 100, 0, p.min_transfer_min, p.include_unreserved
    )
    direct = _snap_direct(tt, {a.code}, {b.code}, loose)
    cap = (min(j.km for j in direct) if direct else haversine_km(a, b) * 1.6) + loose.extra_km
    conns = _snap_connections(tt, {a.code}, {b.code}, loose, cap)
    if direct:
        limit = min(j.minutes for j in direct) + loose.extra_hours * 60
        conns = [j for j in conns if j.minutes <= limit]
    counts = Counter(j.legs[0].to_code for j in conns)
    # Stations next to either end are covered by the nearby-station check; don't spend requests on them.
    too_close = max(p.nearby_km, 10) + 5
    hubs = []
    for code, _ in counts.most_common():
        s = tt.station(code)
        if s and min(haversine_km(s, a), haversine_km(s, b)) > too_close:
            hubs.append(code)
        if len(hubs) == k:
            break
    return hubs


# --------------------------------------------------------------------------- live path


def _live_candidates(tt, live: RailRadar, a, b, near_a, near_b, p, usage: Usage, warnings: list[str]):
    hubs = suggest_hubs(tt, a, b, p)
    nearby_from = sorted(near_a, key=tt.reserved_halts, reverse=True)[:LIVE_NEARBY]
    nearby_to = sorted(near_b, key=tt.reserved_halts, reverse=True)[:LIVE_NEARBY]

    pairs = {(a.code, b.code)}
    pairs |= {(n, b.code) for n in nearby_from}
    pairs |= {(a.code, n) for n in nearby_to}
    for h in hubs:
        pairs |= {(a.code, h), (h, b.code)}

    def fetch(pair):
        try:
            return pair, live.legs_between(*pair, usage)
        except LiveError as e:
            if pair == (a.code, b.code):
                raise
            return pair, e

    with ThreadPoolExecutor(max_workers=6) as pool:
        results = dict(pool.map(fetch, sorted(pairs)))

    failed = [f"{x}→{y}" for (x, y), r in results.items() if isinstance(r, LiveError)]
    if failed:
        warnings.append(f"Live data unavailable for {len(failed)} segment(s): {', '.join(failed[:4])}")
    opts = {k: v for k, v in results.items() if not isinstance(v, LiveError)}

    def usable(o: LegOption) -> bool:
        return _eligible(o.train, p)

    def board_today(o: LegOption) -> Leg | None:
        leg = Leg(o.train, o.from_code, o.to_code, o.dep, o.arr, o.km, p.journey_date)
        return leg if _runs(o.train, p.journey_date, o.dep) else None

    all_direct: list[Journey] = []
    for pair in [(a.code, b.code), *[(n, b.code) for n in nearby_from], *[(a.code, n) for n in nearby_to]]:
        for o in opts.get(pair, []):
            if usable(o) and (leg := board_today(o)):
                all_direct.append(Journey("direct", [leg]))

    direct = [j for j in all_direct if j.legs[0].from_code == a.code and j.legs[-1].to_code == b.code]
    direct_numbers = {j.legs[0].train.number for j in direct}

    best: dict[tuple[str, str], Journey] = {}
    for h in hubs:
        firsts = [o for o in opts.get((a.code, h), []) if usable(o) and o.train.number not in direct_numbers]
        seconds = [o for o in opts.get((h, b.code), []) if usable(o) and o.train.number not in direct_numbers]
        for o1 in firsts:
            leg1 = board_today(o1)
            if not leg1:
                continue
            ready = leg1.arrive_at + timedelta(minutes=p.min_transfer_min)
            for o2 in seconds:
                if o2.train.number == o1.train.number:
                    continue
                leg2 = _next_leg((o2.train, o2.from_code, o2.to_code, o2.dep, o2.arr, o2.km), ready)
                if leg2 is None or (leg2.depart_at - leg1.arrive_at).total_seconds() / 60 > MAX_LAYOVER_MIN:
                    continue
                _keep_best(best, Journey("connection", [leg1, leg2]))
    return direct, all_direct, list(best.values())


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
        return (min(j.km for j in direct) if direct else straight * 1.6) + p.extra_km

    usage, warnings = Usage(), []
    source = "snapshot"
    if live:
        try:
            direct, all_direct, connections = _live_candidates(tt, live, a, b, near_a, near_b, p, usage, warnings)
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

    alternates: list[Journey] = []
    if base_min is not None:
        max_min = base_min + p.extra_hours * 60
        max_km = base_km + p.extra_km
        alternates = [j for j in nearby + connections if j.minutes <= max_min and j.km <= max_km]

    alternates.sort(key=lambda j: (j.minutes, j.km))
    alternates = _diversify(alternates, p.limit)
    direct.sort(key=lambda j: j.depart_at)

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
        },
        "data_source": {
            "kind": source,
            "live_configured": live is not None,
            "requests": usage.requests,
            "cache_hits": usage.cache_hits,
            "month_requests": live.month_requests() if live else None,
            "warnings": warnings,
        },
        "baseline": None
        if base_min is None
        else {
            "minutes": base_min,
            "km": base_km,
            "source": "direct" if direct else "best_alternate",
            "max_minutes": base_min + p.extra_hours * 60,
            "max_km": base_km + p.extra_km,
        },
        "nearby_stations": {
            "from": [{"code": c, "name": tt.station(c).name, "distance_km": round(d, 1)} for c, d in near_a.items()],
            "to": [{"code": c, "name": tt.station(c).name, "distance_km": round(d, 1)} for c, d in near_b.items()],
        },
        "direct": [_journey(tt, j, base_min, base_km, now, near_a, near_b) for j in direct],
        "alternates": [_journey(tt, j, base_min, base_km, now, near_a, near_b) for j in alternates],
    }


def _best_per_train(items: list[Journey]) -> list[Journey]:
    best: dict[str, Journey] = {}
    for j in items:
        n = j.legs[0].train.number
        if n not in best or j.minutes < best[n].minutes:
            best[n] = j
    return list(best.values())


def _diversify(items: list[Journey], limit: int) -> list[Journey]:
    """Stop one busy transfer hub or one first train from crowding out everything else."""
    per_hub: dict[str, int] = {}
    per_first: dict[str, int] = {}
    out = []
    for j in items:
        if j.kind == "connection":
            hub = j.legs[0].to_code
            first = j.legs[0].train.number
            if per_hub.get(hub, 0) >= 3 or per_first.get(first, 0) >= 3:
                continue
            per_hub[hub] = per_hub.get(hub, 0) + 1
            per_first[first] = per_first.get(first, 0) + 1
        out.append(j)
        if len(out) >= limit:
            break
    return out


def _station(s: Station) -> dict:
    return {"code": s.code, "name": s.name, "state": s.state, "lat": s.lat, "lon": s.lon}


def _name(tt: StaticTimetable, code: str) -> str:
    s = tt.station(code)
    return s.name if s else code


def _journey(tt, j: Journey, base_min, base_km, now, near_a, near_b) -> dict:
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
    if j.kind == "connection":
        out["transfer"] = {
            "station": {"code": first.to_code, "name": _name(tt, first.to_code)},
            "wait_minutes": int((j.legs[1].depart_at - first.arrive_at).total_seconds() // 60),
        }
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
        "from": {"code": leg.from_code, "name": _name(tt, leg.from_code)},
        "to": {"code": leg.to_code, "name": _name(tt, leg.to_code)},
        "depart_at": leg.depart_at.isoformat(),
        "arrive_at": leg.arrive_at.isoformat(),
        "minutes": leg.arr - leg.dep,
        "km": leg.km,
        "origin_date": (leg.board_date - timedelta(days=leg.boarding_day_offset)).isoformat(),
        "booking_windows": windows,
    }
