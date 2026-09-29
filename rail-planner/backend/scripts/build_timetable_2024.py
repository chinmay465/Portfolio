"""Build the bundled timetable from the September 2024 Indian Railways dataset (RSTGCN, IIT Kharagpur).

Sources:
    https://github.com/KoyenaChowdhury/RSTGCN      train_routes_Sep2024.csv, train_delays_Sep2024.json
    https://github.com/datameet/railways           stations.json, trains.json (coordinates, states, classes)

    git clone --depth 1 https://github.com/KoyenaChowdhury/RSTGCN.git /tmp/rstgcn
    unzip -q /tmp/rstgcn/Indian-Railway-Network-and-Delays.zip -d /tmp/rstgcn
    git clone --depth 1 https://github.com/datameet/railways.git /tmp/railways
    python scripts/build_timetable_2024.py /tmp/rstgcn/Indian-Railway-Network-and-Delays /tmp/railways data/timetable.json.gz

Output is the same shape build_timetable.py writes, plus running days and a meta block:
    {
      "meta": {"source", "as_of", "run_days": true, ...},
      "stations": {code: [name, lat, lon, state]},
      "trains": {number: {"name", "type", "classes", "distance", "days": [0..6],
                          "stops": [[code, arr_min, dep_min, km], ...]}}
    }
Times are minutes from 00:00 on the day the train leaves its origin. The route CSV gives the stop
order and distances; its times are wrong for some trains (every halt copied from the origin), so
each halt's time is the scheduled time most often recorded for it in the September run records,
falling back to the CSV. Both are clock times only, so the day is inferred: whenever a time is
earlier than the previous one, a day has passed. Trains whose times still imply an impossible
speed over a hop of 50 km or more are dropped.

Running days (Mon=0 .. Sun=6) are the weekdays on which each train actually left its origin in
September 2024, taken from the observed run records (keyed by start date). Every weekday occurs
4-5 times that month, so a train that runs on a weekday is almost always seen on it.

Coordinates come from datameet. Stations it lacks are placed by interpolating along the route
of a train that passes them, between the nearest halts with known coordinates.
"""

from __future__ import annotations

import csv
import gzip
import json
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

CLASS_FLAGS = {"first_ac": "1A", "second_ac": "2A", "third_ac": "3A", "sleeper": "SL", "chair_car": "CC", "first_class": "FC"}

# (name keyword, type code, classes when datameet has none). Checked in order; first match wins.
NAME_TYPES = [
    ("vande bharat", "VB", ["EC", "CC"]),
    ("jan shatabdi", "JShtb", []),
    ("shatabdi", "Shtb", ["EC", "CC"]),
    ("rajdhani", "Raj", ["1A", "2A", "3A"]),
    ("duronto", "Drnt", []),
    ("garib rath", "GR", ["3A"]),
    ("humsafar", "SF", ["3A"]),
    ("tejas", "SF", []),
    ("antyodaya", "Exp", []),
    ("memu", "MEMU", []),
    ("demu", "DEMU", []),
    ("passenger", "Pass", []),
    ("mail", "Mail", []),
]


def clock(value: str) -> int | None:
    value = (value or "").strip()
    if not value or value in {"--", "None", "Source", "Destination"}:
        return None
    t = datetime.strptime(value, "%I:%M %p")
    return t.hour * 60 + t.minute


def train_type(number: str, name: str) -> tuple[str, list[str]]:
    low = name.lower()
    for key, code, classes in NAME_TYPES:
        if key in low:
            return code, classes
    if number.startswith("0"):
        return "Spl", []
    if number[:2] in {"12", "20", "22"}:
        return "SF", []
    return "Exp", []


MAX_KMH = 180  # faster than any Indian train between halts: a bad time, not a fast train
CHECK_KM = 50  # shorter hops are left alone: a minute of rounding makes them look fast


def scheduled_times(records: dict) -> dict[str, tuple[str, str]]:
    """Per station, the (scheduled arrival, scheduled departure) most often recorded that month."""
    seen: dict[str, Counter] = defaultdict(Counter)
    for halts in records.values():
        for code, v in (halts or {}).items():
            if len(v) >= 4 and v[0] and v[3]:
                seen[code][(v[0], v[3])] += 1
    return {code: c.most_common(1)[0][0] for code, c in seen.items()}


def plausible(stops: list[list]) -> bool:
    for a, b in zip(stops, stops[1:]):
        minutes, km = b[1] - a[2], b[3] - a[3]
        if km < 0 or (km >= CHECK_KM and (minutes <= 0 or km / minutes * 60 > MAX_KMH)):
            return False
    return True


def build_stops(rows: list[dict], sched: dict[str, tuple[str, str]]) -> list[list] | None:
    """[[code, arr, dep, km], ...] with day rollovers applied; None if the times don't make sense."""
    stops, last = [], None
    for i, r in enumerate(rows):
        first, final = i == 0, i == len(rows) - 1
        arr_s, dep_s = sched.get(r["station_code"]) or (r["arrivalTime"], r["departureTime"])
        arr, dep = clock(arr_s), clock(dep_s)
        if first:
            arr = None
        if final:
            dep = None
        if arr is None and dep is None:
            return None
        out = []
        for t in (arr, dep):
            if t is None:
                out.append(None)
                continue
            if last is not None:
                t += (last // 1440) * 1440
                while t < last:
                    t += 1440
            out.append(t)
            last = t
        stops.append([r["station_code"], out[0], out[1], int(float(r["distance"] or 0))])
    if len(stops) < 2 or stops[0][2] is None or stops[-1][1] is None or not plausible(stops):
        return None
    return stops


def run_days(records: dict) -> list[int]:
    """Weekdays with a non-empty run record; records are keyed by the date the train left its origin."""
    days = {datetime.strptime(d, "%d-%m-%Y").weekday() for d, halts in records.items() if halts}
    return sorted(days) or list(range(7))


def place_missing(stations: dict, trains: dict, names: dict) -> int:
    """Interpolate coordinates for stations datameet lacks, from any train that passes them."""
    placed = 0
    for _ in range(3):  # a second pass can use stations placed by the first
        for t in trains.values():
            stops = t["stops"]
            for i, (code, *_rest, km) in enumerate(stops):
                if code in stations:
                    continue
                prev = next((s for s in reversed(stops[:i]) if s[0] in stations), None)
                nxt = next((s for s in stops[i + 1 :] if s[0] in stations), None)
                if not prev and not nxt:
                    continue
                if prev and nxt and nxt[3] > prev[3]:
                    f = (km - prev[3]) / (nxt[3] - prev[3])
                    a, b = stations[prev[0]], stations[nxt[0]]
                    lat, lon = a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f
                    state = a[3] if a[3] == b[3] else ""
                elif abs((prev or nxt)[3] - km) <= 30:  # at a route end: only close to a known halt
                    s = stations[(prev or nxt)[0]]
                    lat, lon, state = s[1], s[2], s[3]
                else:
                    continue
                stations[code] = [names[code], round(lat, 5), round(lon, 5), state]
                placed += 1
    return placed


def main(src: Path, datameet: Path, out: Path) -> None:
    rows_by_train: dict[str, list[dict]] = defaultdict(list)
    with open(src / "train_routes_Sep2024.csv", newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            rows_by_train[r["trainNumber"].strip()].append(r)
    records = json.loads((src / "train_delays_Sep2024.json").read_text())

    dm_stations = {
        f["properties"]["code"]: f for f in json.loads((datameet / "stations.json").read_text())["features"]
    }
    dm_trains = {f["properties"]["number"]: f["properties"] for f in json.loads((datameet / "trains.json").read_text())["features"]}

    names: dict[str, str] = {}
    trains: dict[str, dict] = {}
    dropped = 0
    for number, rows in rows_by_train.items():
        rows.sort(key=lambda r: int(r["stnSerialNumber"]))
        for r in rows:
            names.setdefault(r["station_code"], r["station_name"].strip())
        stops = build_stops(rows, scheduled_times(records.get(number, {})))
        if not stops:
            dropped += 1
            continue
        name = rows[0]["trainName"].strip()
        ttype, default_classes = train_type(number, name)
        old = dm_trains.get(number)
        classes = [c for k, c in CLASS_FLAGS.items() if old and old.get(k)] or default_classes
        trains[number] = {
            "name": name,
            "type": ttype,
            "classes": classes,
            "distance": stops[-1][3],
            "days": run_days(records.get(number, {})),
            "stops": stops,
        }

    stations: dict[str, list] = {}
    for code, name in names.items():
        f = dm_stations.get(code)
        if f and f.get("geometry"):
            lon, lat = f["geometry"]["coordinates"]
            stations[code] = [name, round(lat, 5), round(lon, 5), f["properties"].get("state") or ""]
    placed = place_missing(stations, trains, names)
    missing = sorted(set(names) - set(stations))

    # A halt with no coordinates at all is dropped from its train; the station can't be searched anyway.
    for t in trains.values():
        t["stops"] = [s for s in t["stops"] if s[0] in stations]
    trains = {n: t for n, t in trains.items() if len(t["stops"]) >= 2}

    meta = {
        "source": "Indian Railways timetable, September 2024 (RSTGCN dataset, IIT Kharagpur)",
        "as_of": "2024-09",
        "run_days": True,
        "built": datetime.now().strftime("%Y-%m-%d"),
        "trains": len(trains),
        "stations": len(stations),
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(out, "wt", encoding="utf-8") as fh:
        json.dump({"meta": meta, "stations": stations, "trains": trains}, fh, separators=(",", ":"))
    print(
        f"{len(trains)} trains, {len(stations)} stations ({placed} placed by interpolation, "
        f"{len(missing)} without coordinates dropped, {dropped} trains with bad times dropped) "
        f"-> {out} ({out.stat().st_size / 1e6:.1f} MB)"
    )


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]))
