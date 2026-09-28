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
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta

from .rules import IST, booking_windows, window_status
from .timetable import Station, Timetable, Train, haversine_km

MAX_LAYOVER_MIN = 12 * 60  # hard cap while collecting candidates, before tolerance filtering


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
    train: Train
    board_idx: int
    alight_idx: int
    board_date: date  # date the train leaves the boarding station

    @property
    def board(self):
        return self.train.stops[self.board_idx]

    @property
    def alight(self):
        return self.train.stops[self.alight_idx]

    @property
    def depart_at(self) -> datetime:
        dep = self.board.dep
        return datetime.combine(self.board_date, time(0), IST) + timedelta(minutes=dep % 1440)

    @property
    def arrive_at(self) -> datetime:
        return self.depart_at + timedelta(minutes=self.alight.arr - self.board.dep)

    @property
    def km(self) -> int:
        return self.alight.km - self.board.km

    @property
    def boarding_day_offset(self) -> int:
        return self.board.dep // 1440


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


def _runs(train: Train, board_date: date, board_dep: int) -> bool:
    origin = board_date - timedelta(days=board_dep // 1440)
    return origin.weekday() in train.runs_on


def _eligible(train: Train, p: SearchParams) -> bool:
    return p.include_unreserved or train.reserved


def _direct(tt: Timetable, origins: set[str], dests: set[str], p: SearchParams) -> list[Journey]:
    out = []
    for train, i in _departures(tt, origins, p):
        for j in range(i + 1, len(train.stops)):
            if train.stops[j].code in dests and train.stops[j].arr is not None:
                out.append(Journey("direct", [Leg(train, i, j, p.journey_date)]))
                break  # first matching destination halt on this train
    return out


def _departures(tt: Timetable, origins: set[str], p: SearchParams):
    for code in origins:
        for train, i in tt.trains_at(code):
            stop = train.stops[i]
            if stop.dep is None or not _eligible(train, p):
                continue
            if _runs(train, p.journey_date, stop.dep):
                yield train, i


def _connections(tt: Timetable, origins: set[str], dests: set[str], p: SearchParams, km_cap: float) -> list[Journey]:
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
            if stop_x.code in dests:
                break  # it's a direct train from here on
            if stop_x.arr is None or stop_x.code not in feeders:
                continue
            km1 = stop_x.km - leg1_start.km
            if km1 > km_cap:
                break
            leg1 = Leg(t1, i, x, p.journey_date)
            ready = leg1.arrive_at + timedelta(minutes=p.min_transfer_min)
            for t2, k, j in feeders[stop_x.code]:
                if t2.number == t1.number:
                    continue
                if km1 + t2.stops[j].km - t2.stops[k].km > km_cap:
                    continue
                leg2 = _next_departure(t2, k, j, ready)
                if leg2 is None:
                    continue
                wait = (leg2.depart_at - leg1.arrive_at).total_seconds() / 60
                if wait > MAX_LAYOVER_MIN:
                    continue
                j2 = Journey("connection", [leg1, leg2])
                key = (t1.number.split("-")[0], t2.number.split("-")[0])  # fold slip coaches into their parent
                cur = best.get(key)
                if cur is None or (j2.arrive_at, -j2.depart_at.timestamp()) < (cur.arrive_at, -cur.depart_at.timestamp()):
                    best[key] = j2
    return list(best.values())


def _next_departure(train: Train, k: int, j: int, ready: datetime) -> Leg | None:
    dep = train.stops[k].dep
    clock = timedelta(minutes=dep % 1440)
    day = ready.date()
    for _ in range(3):
        when = datetime.combine(day, time(0), IST) + clock
        if when >= ready and _runs(train, day, dep):
            return Leg(train, k, j, day)
        day += timedelta(days=1)
    return None


def search(tt: Timetable, p: SearchParams) -> dict:
    a, b = tt.station(p.from_code), tt.station(p.to_code)
    if not a or not b:
        raise ValueError("Unknown station code")
    if a.code == b.code:
        raise ValueError("Origin and destination are the same")

    near_a = {s.code: d for s, d in tt.nearby(a.code, p.nearby_km)}
    near_b = {s.code: d for s, d in tt.nearby(b.code, p.nearby_km)}
    origins = {a.code, *near_a}
    dests = {b.code, *near_b}

    all_direct = _direct(tt, origins, dests, p)
    direct = [j for j in all_direct if j.legs[0].board.code == a.code and j.legs[-1].alight.code == b.code]
    direct_trains = {j.legs[0].train.number for j in direct}
    nearby = [j for j in all_direct if j.legs[0].train.number not in direct_trains]
    nearby = _best_per_train(nearby)
    for j in nearby:
        j.kind = "nearby"

    straight = haversine_km(a, b)
    if direct:
        base_min = min(j.minutes for j in direct)
        base_km = min(j.km for j in direct)
        km_cap = base_km + p.extra_km
    else:
        base_min = base_km = None
        km_cap = straight * 1.6 + p.extra_km  # rail routes rarely exceed ~1.5x the crow-fly distance

    connections = _connections(tt, origins, dests, p, km_cap)

    if base_min is None:
        pool = nearby + connections
        if pool:
            base_min = min(j.minutes for j in pool)
            base_km = min(j.km for j in pool)

    alternates: list[Journey] = []
    if base_min is not None:
        max_min = base_min + p.extra_hours * 60
        max_km = base_km + p.extra_km
        for j in nearby + connections:
            if j.minutes <= max_min and j.km <= max_km:
                alternates.append(j)

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
            hub = j.legs[0].alight.code
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
            "board_offset_km": round(near_a.get(first.board.code, 0), 1),
            "alight_offset_km": round(near_b.get(last.alight.code, 0), 1),
        },
    }
    if j.kind == "connection":
        out["transfer"] = {
            "station": {"code": first.alight.code, "name": tt.station(first.alight.code).name},
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
        "train": {"number": t.number, "name": t.name, "type": t.type, "classes": list(t.classes), "reserved": t.reserved},
        "from": {"code": leg.board.code, "name": tt.station(leg.board.code).name},
        "to": {"code": leg.alight.code, "name": tt.station(leg.alight.code).name},
        "depart_at": leg.depart_at.isoformat(),
        "arrive_at": leg.arrive_at.isoformat(),
        "minutes": leg.alight.arr - leg.board.dep,
        "km": leg.km,
        "origin_date": (leg.board_date - timedelta(days=leg.boarding_day_offset)).isoformat(),
        "booking_windows": windows,
    }
