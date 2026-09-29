"""Routes with any number of changes, optionally forced through "via" stations.

The search runs over a small set of useful stations (origin/destination and their nearby
stations, likely change points, and any via stations). A "leg" is one train between two of
those stations. That works the same for both data sources:

    snapshot   legs come from the bundled timetable's stop lists
    live       legs come from intersecting two RailRadar station boards (no extra requests)

It is a beam search over (station, time) states, one train per round:
  * a new train costs one change and needs `min_transfer_min` at the station;
  * staying on the same train through a via station costs nothing;
  * every leg must run on its date (running days are checked per leg);
  * partial routes are pruned with the user's time/distance limits, using a crow-fly lower
    bound for what's left, and the best few per (station, changes) survive each round.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from typing import Callable, Iterable

from .railradar import BoardStop, LegOption, legs_from_boards
from .rules import IST
from .timetable import StaticTimetable, haversine_km

BEAM = 6  # partial routes kept per (station, via progress, changes) each round
MAX_STATES = 600  # hard ceiling per round, to keep "no limit" searches fast
FASTEST_KMPH = 130  # optimistic speed for the time lower bound on the unexplored remainder


@dataclass
class _State:
    station: str
    legs: tuple  # ((LegOption, day), ...): day = offset from the journey date when the train leaves this leg's start
    start: int  # minutes from journey-date 00:00 when the first train leaves
    arrive: int  # minutes from journey-date 00:00 at `station`
    changes: int
    km: int
    visited: frozenset
    via_i: int


@dataclass
class MultiResult:
    legs: list  # merged legs (same train through a via station becomes one leg)
    via_hit: list[str] = field(default_factory=list)


class SnapshotLegs:
    """Legs between any two stations from the bundled timetable, cached per origin station."""

    def __init__(self, tt: StaticTimetable, eligible: Callable) -> None:
        self._tt = tt
        self._eligible = eligible
        self._from: dict[str, dict[str, list[LegOption]]] = {}

    def options(self, x: str, y: str) -> list[LegOption]:
        if x not in self._from:
            out: dict[str, list[LegOption]] = {}
            for t, i in self._tt.trains_at(x):
                s = t.stops[i]
                if s.dep is None or not self._eligible(t):
                    continue
                for e in t.stops[i + 1 :]:
                    if e.arr is not None:
                        out.setdefault(e.code, []).append(LegOption(t, x, e.code, s.dep, e.arr, e.km - s.km))
            self._from[x] = out
        return self._from[x].get(y, [])


class BoardLegs:
    """Legs between any two stations from live station boards."""

    def __init__(self, boards: dict[str, dict[str, BoardStop]], eligible: Callable) -> None:
        self._boards = boards
        self._eligible = eligible
        self._cache: dict[tuple[str, str], list[LegOption]] = {}

    def options(self, x: str, y: str) -> list[LegOption]:
        if (x, y) not in self._cache:
            if x in self._boards and y in self._boards:
                legs = legs_from_boards(self._boards[x], self._boards[y])
                self._cache[(x, y)] = [o for o in legs if self._eligible(o.train)]
            else:
                self._cache[(x, y)] = []
        return self._cache[(x, y)]


def suggest_multi_hubs(tt: StaticTimetable, origins: set[str], dests: set[str], a, b, k: int) -> list[str]:
    """Stations with the most trains out of the origin side, and the most into the destination side.

    For 2+ changes the middle legs run between these two groups.
    """
    too_close = 20
    out_count: dict[str, int] = {}
    for o in origins:
        for t, i in tt.trains_at(o):
            if t.stops[i].dep is None or not t.reserved:
                continue
            for s in t.stops[i + 1 :]:
                out_count[s.code] = out_count.get(s.code, 0) + 1
    in_count: dict[str, int] = {}
    for d in dests:
        for t, j in tt.trains_at(d):
            if t.stops[j].arr is None or not t.reserved:
                continue
            for s in t.stops[:j]:
                in_count[s.code] = in_count.get(s.code, 0) + 1

    def ok(code: str) -> bool:
        st = tt.station(code)
        return bool(st) and code not in origins and code not in dests and min(
            haversine_km(st, a), haversine_km(st, b)
        ) > too_close and tt.reserved_halts(code) >= 20

    top_out = [c for c, _ in sorted(out_count.items(), key=lambda x: -x[1]) if ok(c)][:k]
    top_in = [c for c, _ in sorted(in_count.items(), key=lambda x: -x[1]) if ok(c)][:k]
    return list(dict.fromkeys(top_out + top_in))


def multi_search(
    legs_src,
    tt: StaticTimetable,
    nodes: Iterable[str],
    origins: Iterable[str],
    dests: set[str],
    dest_station,
    journey_date: date,
    max_changes: int,
    min_transfer_min: int,
    via: list[str],
    max_total_min: float,
    max_km: float,
    make_leg: Callable,
    per_hop: int = 2,
    via_stays: dict[str, int] | None = None,
    max_wait_min: float = float("inf"),
    via_groups: list[set[str]] | None = None,
    earliest_dep: int = 0,  # minutes from journey-date 00:00; first train may not leave earlier
    latest_arr: float = float("inf"),  # minutes from journey-date 00:00; must arrive by then
) -> list[MultiResult]:
    """All times are integer minutes from 00:00 on the journey date (fast; no datetimes in the loop).

    via_stays: planned stop (minutes) at a via station; the route must get off there and the next
    train leaves at least that long after arrival. max_wait_min caps waiting at any change, counted
    on top of a planned stay.
    """
    via_stays = via_stays or {}
    nodes = list(dict.fromkeys(nodes))
    # Each via point can be satisfied by any station in its group (the station plus a km buffer).
    groups = via_groups or [{c} for c in via]
    via_of: dict[str, int] = {}
    for i, g in enumerate(groups):
        for c in g:
            via_of.setdefault(c, i)
    remaining_km = {c: haversine_km(s, dest_station) if (s := tt.station(c)) else 0.0 for c in nodes}
    wd0 = journey_date.weekday()

    def runs(o: LegOption, day: int) -> bool:
        return (wd0 + day - o.dep // 1440) % 7 in o.train.runs_on

    def first_after(o: LegOption, ready: int) -> int | None:
        clock = o.dep % 1440
        day = max(0, -(-(ready - clock) // 1440))  # ceil
        for d in range(day, day + 8):
            if runs(o, d):
                return d
        return None

    origins = list(origins)
    # Origin-side stations are only starting points: never ride to one mid-route (e.g. BNC -> KJM).
    states = [_State(o, (), 0, 0, 0, 0, frozenset(origins), 0) for o in origins]
    results: list[MultiResult] = []

    for _ in range(max_changes + 1 + len(via)):
        grown: list[_State] = []
        for st in states:
            cur = st.legs[-1] if st.legs else None
            just_hit_via = cur is not None and st.station in via_of
            for y in nodes:
                vi = via_of.get(y)
                if y in st.visited or (vi is not None and vi != st.via_i):
                    continue  # no loops; via points in order
                new_via_i = st.via_i + (1 if vi is not None else 0)
                reaching_dest = y in dests
                if reaching_dest and new_via_i != len(via):
                    continue
                lb_min = 0 if reaching_dest else remaining_km[y] / FASTEST_KMPH * 60
                lb_km = 0 if reaching_dest else remaining_km[y]

                cands = []
                for o in legs_src.options(st.station, y):
                    if cur is None:
                        if not runs(o, 0) or o.dep % 1440 < earliest_dep:
                            continue
                        day, changes = 0, 0
                    elif o.train.number == cur[0].train.number:
                        # Stay on the same run; only worth modelling right after a via station,
                        # and not when you planned to stop there.
                        if not just_hit_via or o.dep < cur[0].arr or via_stays.get(st.station, 0) > 0:
                            continue
                        day, changes = cur[1] + (o.dep // 1440 - cur[0].dep // 1440), st.changes
                    else:
                        if st.changes >= max_changes:
                            continue
                        stay = via_stays.get(st.station, 0) if just_hit_via else 0
                        day = first_after(o, st.arrive + max(min_transfer_min, stay))
                        if day is None:
                            continue
                        if day * 1440 + o.dep % 1440 - st.arrive - stay > max_wait_min:
                            continue  # waiting too long at this station
                        changes = st.changes + 1
                    dep = day * 1440 + o.dep % 1440
                    arr = dep + (o.arr - o.dep)
                    start = dep if cur is None else st.start
                    km = st.km + o.km
                    if arr - start + lb_min > max_total_min or km + lb_km > max_km or arr + lb_min > latest_arr:
                        continue
                    cands.append((arr, km, o, day, changes, start))

                cands.sort(key=lambda c: (c[0], c[1]))
                for arr, km, o, day, changes, start in cands[: per_hop if not reaching_dest else len(cands)]:
                    legs = st.legs + ((o, day),)
                    if reaching_dest:
                        built = [make_leg(x, journey_date + timedelta(days=d)) for x, d in legs]
                        results.append(MultiResult(_merge(built), list(via)))
                    else:
                        grown.append(_State(y, legs, start, arr, changes, km, st.visited | {y}, new_via_i))

        # Beam: earliest arrivals per (station, via progress, changes), then a global cap.
        buckets: dict[tuple, list[_State]] = {}
        for s in grown:
            buckets.setdefault((s.station, s.via_i, s.changes), []).append(s)
        states = []
        for group in buckets.values():
            group.sort(key=lambda s: (s.arrive, s.km))
            seen, kept = set(), []
            for s in group:
                sig = tuple(o.train.number for o, _ in s.legs)
                if sig not in seen:
                    seen.add(sig)
                    kept.append(s)
                    if len(kept) == BEAM:
                        break
            states.extend(kept)
        states.sort(key=lambda s: s.arrive)
        states = states[:MAX_STATES]
        if not states:
            break
    return results


def _merge(legs: list) -> list:
    """Join consecutive legs on the same train run (stayed on through a via station)."""
    from .search import Leg  # local import to avoid a cycle

    out = [legs[0]]
    for leg in legs[1:]:
        prev = out[-1]
        if leg.train.number == prev.train.number and leg.dep >= prev.arr:
            out[-1] = Leg(
                prev.train, prev.from_code, leg.to_code, prev.dep, leg.arr, prev.km + leg.km, prev.board_date,
                passes=(*prev.passes, prev.to_code, *leg.passes),
            )
        else:
            out.append(leg)
    return out
