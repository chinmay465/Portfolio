"""Timetable data layer.

`Timetable` is the interface the search code depends on. `StaticTimetable` loads the bundled
open-data snapshot (see scripts/build_timetable_2024.py); swap in a live provider by
implementing the same methods.
"""

from __future__ import annotations

import gzip
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

# Long-distance train types that carry reserved coaches even when class flags are missing.
RESERVED_TYPES = {"Exp", "SF", "Mail", "Raj", "Shtb", "JShtb", "Drnt", "GR", "SKr"}

DEFAULT_DATA = Path(__file__).resolve().parent.parent / "data" / "timetable.json.gz"


@dataclass(frozen=True)
class Station:
    code: str
    name: str
    lat: float
    lon: float
    state: str


@dataclass(frozen=True)
class Stop:
    code: str
    arr: int | None  # minutes from 00:00 of origin day; None at origin
    dep: int | None  # None at terminus
    km: int


@dataclass(frozen=True)
class Train:
    number: str
    name: str
    type: str
    classes: tuple[str, ...]
    distance: int
    stops: tuple[Stop, ...]
    # Mon=0 .. Sun=6 for departures from origin; a snapshot without running days treats every
    # train as daily.
    runs_on: frozenset[int] = frozenset(range(7))

    @property
    def reserved(self) -> bool:
        return bool(self.classes) or self.type in RESERVED_TYPES


class Timetable(Protocol):
    def station(self, code: str) -> Station | None: ...
    def search_stations(self, query: str, limit: int = 10) -> list[Station]: ...
    def nearby(self, code: str, radius_km: float, min_halts: int = 15, limit: int = 6) -> list[tuple[Station, float]]: ...
    def train(self, number: str) -> Train | None: ...
    def trains_at(self, code: str) -> list[tuple[Train, int]]: ...


def haversine_km(a: Station, b: Station) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (a.lat, a.lon, b.lat, b.lon))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


# Big cities: typing the city (old or new name) lists its main terminals first, busiest first.
_MUMBAI = ["CSMT", "LTT", "MMCT", "DR", "BDTS", "TNA", "PNVL"]
_BENGALURU = ["SBC", "SMVB", "YPR", "KJM", "BNC", "BNCE"]
_DELHI = ["NDLS", "NZM", "DLI", "ANVT", "DEE"]
_CHENNAI = ["MAS", "MS", "TBM"]
_KOLKATA = ["HWH", "SDAH", "KOAA", "SHM"]
_HYDERABAD = ["SC", "HYB", "KCG", "LPI"]
_PUNE = ["PUNE", "SVJR", "KK", "HDP"]
_KOCHI = ["ERS", "ERN"]
CITY_GROUPS: dict[str, list[str]] = {
    "mumbai": _MUMBAI, "bombay": _MUMBAI,
    "bengaluru": _BENGALURU, "bangalore": _BENGALURU,
    "delhi": _DELHI, "new delhi": _DELHI,
    "chennai": _CHENNAI, "madras": _CHENNAI,
    "kolkata": _KOLKATA, "calcutta": _KOLKATA,
    "hyderabad": _HYDERABAD, "secunderabad": ["SC"],
    "pune": _PUNE, "poona": _PUNE,
    "kochi": _KOCHI, "cochin": _KOCHI, "ernakulam": _KOCHI,
    "thiruvananthapuram": ["TVC"], "trivandrum": ["TVC"],
    "hubballi": ["UBL"], "hubli": ["UBL"], "belagavi": ["BGM"], "belgaum": ["BGM"],
    "kalaburagi": ["KLBG"], "gulbarga": ["KLBG"], "mysuru": ["MYS"], "mysore": ["MYS"],
    "mangaluru": ["MAQ", "MAJN"], "mangalore": ["MAQ", "MAJN"],
    "vadodara": ["BRC"], "baroda": ["BRC"], "kozhikode": ["CLT"], "calicut": ["CLT"],
    "tiruchirappalli": ["TPJ"], "trichy": ["TPJ"], "visakhapatnam": ["VSKP"], "vizag": ["VSKP"],
    "gurugram": ["GGN"], "gurgaon": ["GGN"], "varanasi": ["BSB"], "banaras": ["BSB"], "benares": ["BSB"],
}
# Timetable names are often abbreviated ("C Shivaji Mah T"); show readable names for the big terminals.
DISPLAY_NAMES = {
    "CSMT": "Mumbai CSMT (Chhatrapati Shivaji Maharaj Terminus)", "LTT": "Mumbai LTT (Lokmanya Tilak Terminus)",
    "MMCT": "Mumbai Central", "BDTS": "Mumbai Bandra Terminus", "DR": "Dadar", "DDR": "Dadar (Western)",
    "SBC": "KSR Bengaluru (Bangalore City)", "SMVB": "SMVT Bengaluru (Baiyappanahalli)", "YPR": "Yesvantpur",
    "KJM": "Krishnarajapuram", "MAS": "Chennai Central (MGR)", "KOAA": "Kolkata Terminal (Chitpur)",
    "UBL": "SSS Hubballi", "CLT": "Kozhikode (Calicut)", "TVC": "Thiruvananthapuram Central",
    "SVJR": "Pune Shivajinagar", "HDP": "Hadapsar (Pune)", "GGN": "Gurugram (Gurgaon)",
}


class StaticTimetable:
    def __init__(self, path: Path = DEFAULT_DATA) -> None:
        with gzip.open(path, "rt", encoding="utf-8") as fh:
            raw = json.load(fh)
        # {"source", "as_of", "run_days"}; the old datameet file has no meta block
        self.meta: dict = raw.get("meta") or {"source": "datameet snapshot (2016-17)", "as_of": "2016", "run_days": False}

        self._stations = {
            code: Station(code, DISPLAY_NAMES.get(code, name), lat, lon, state)
            for code, (name, lat, lon, state) in raw["stations"].items()
        }
        self._trains: dict[str, Train] = {}
        self._at: dict[str, list[tuple[Train, int]]] = {}
        for number, t in raw["trains"].items():
            train = Train(
                number=number,
                name=t["name"],
                type=t["type"],
                classes=tuple(t["classes"]),
                distance=t["distance"],
                stops=tuple(Stop(*s) for s in t["stops"]),
                runs_on=frozenset(t["days"]) if t.get("days") else frozenset(range(7)),
            )
            self._trains[number] = train
            for i, stop in enumerate(train.stops):
                self._at.setdefault(stop.code, []).append((train, i))

        # busier stations first in autocomplete; reserved-train halts decide what counts as "nearby"
        self._rank = {code: len(v) for code, v in self._at.items()}
        self._reserved_halts = {code: sum(1 for t, _ in v if t.reserved) for code, v in self._at.items()}

    def station(self, code: str) -> Station | None:
        return self._stations.get(code.upper())

    def search_stations(self, query: str, limit: int = 10) -> list[Station]:
        q = query.strip().lower()
        if not q:
            return []
        scored = []
        for s in self._stations.values():
            code, name = s.code.lower(), s.name.lower()
            if code == q:
                score = 0
            elif name.startswith(q):
                score = 1
            elif code.startswith(q):
                score = 2
            elif any(w.startswith(q) for w in name.split()):
                score = 3
            elif q in name:
                score = 4
            else:
                continue
            scored.append((score, -self._rank.get(s.code, 0), s.name, s))
        # City names, old or new ("bangalore", "bombay", "hubli"...): that city's main terminals come first.
        if len(q) >= 3:
            seen = set()
            for city, codes in CITY_GROUPS.items():
                if city.startswith(q) or q.startswith(city):
                    for i, c in enumerate(codes):
                        st = self._stations.get(c)
                        if st and c not in seen:
                            seen.add(c)
                            scored.append((-1 + i / 100, 0, st.name, st))
        scored.sort(key=lambda x: x[:3])
        out, seen = [], set()
        for *_, st in scored:
            if st.code not in seen:
                seen.add(st.code)
                out.append(st)
            if len(out) == limit:
                break
        return out

    def nearby(self, code: str, radius_km: float, min_halts: int = 15, limit: int = 6) -> list[tuple[Station, float]]:
        """Stations within radius that enough reserved trains stop at to be worth boarding from."""
        origin = self.station(code)
        if not origin or radius_km <= 0:
            return []
        out = []
        for s in self._stations.values():
            if s.code == origin.code or self._reserved_halts.get(s.code, 0) < min_halts:
                continue
            d = haversine_km(origin, s)
            if d <= radius_km:
                out.append((s, d))
        # keep the busiest few, then present nearest first
        out.sort(key=lambda x: -self._reserved_halts[x[0].code])
        return sorted(out[:limit], key=lambda x: x[1])

    def train(self, number: str) -> Train | None:
        return self._trains.get(number)

    def search_trains(self, query: str, limit: int = 10) -> list[Train]:
        q = query.strip().lower()
        scored = []
        for t in self._trains.values():
            n, name = t.number.lower(), t.name.lower()
            if n == q:
                score = 0
            elif n.startswith(q):
                score = 1
            elif name.startswith(q):
                score = 2
            elif any(w.startswith(q) for w in name.split()):
                score = 3
            elif q in name:
                score = 4
            else:
                continue
            scored.append((score, t.number, t))
        scored.sort(key=lambda x: x[:2])
        return [t for *_, t in scored[:limit]]

    def reserved_halts(self, code: str) -> int:
        return self._reserved_halts.get(code, 0)

    def trains_at(self, code: str) -> list[tuple[Train, int]]:
        return self._at.get(code.upper(), [])
