"""Convert the datameet Indian Railways dataset into the compact timetable the API loads.

Source: https://github.com/datameet/railways (stations.json, trains.json, schedules.json)

    git clone --depth 1 https://github.com/datameet/railways.git /tmp/railways
    python scripts/build_timetable.py /tmp/railways data/timetable.json.gz

Output shape:
    {
      "stations": {code: [name, lat, lon, state]},
      "trains": {number: {"name", "type", "classes": [...], "distance",
                          "stops": [[code, arr_min, dep_min, km], ...]}}
    }
arr_min / dep_min are minutes from 00:00 on the day the train leaves its origin
(so day 2 at 06:00 is 1800). Only real halts are kept: the origin, the terminus
and stations where arrival != departure.
"""

from __future__ import annotations

import gzip
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

CLASS_FLAGS = {
    "first_ac": "1A",
    "second_ac": "2A",
    "third_ac": "3A",
    "sleeper": "SL",
    "chair_car": "CC",
    "first_class": "FC",
}


def haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1 = map(math.radians, a)
    lat2, lon2 = map(math.radians, b)
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def hhmm_to_min(value: str | None) -> int | None:
    if not value or value == "None":
        return None
    h, m, *_ = value.split(":")
    return int(h) * 60 + int(m)


def title(name: str) -> str:
    return " ".join(w.capitalize() if len(w) > 3 or w.isalpha() else w for w in name.strip().split())


def main(src: Path, out: Path) -> None:
    stations_raw = json.loads((src / "stations.json").read_text())["features"]
    trains_raw = json.loads((src / "trains.json").read_text())["features"]
    schedules = json.loads((src / "schedules.json").read_text())

    stations: dict[str, list] = {}
    for f in stations_raw:
        p = f["properties"]
        if not f.get("geometry"):
            continue
        lon, lat = f["geometry"]["coordinates"]
        stations[p["code"]] = [title(p["name"]), round(lat, 5), round(lon, 5), p.get("state") or ""]

    by_train: dict[str, list] = defaultdict(list)
    for row in schedules:
        by_train[row["train_number"]].append(row)

    trains: dict[str, dict] = {}
    for f in trains_raw:
        p = f["properties"]
        rows = sorted(by_train.get(p["number"], []), key=lambda r: r["id"])
        if len(rows) < 2:
            continue

        # Cumulative geodesic distance through every schedule row, scaled to the official distance.
        cum, total, prev = [], 0.0, None
        for r in rows:
            st = stations.get(r["station_code"])
            if st and prev:
                total += haversine_km(prev, (st[1], st[2]))
            if st:
                prev = (st[1], st[2])
            cum.append(total)
        scale = (p.get("distance") or 0) / total if total > 0 and p.get("distance") else 1.0

        stops, last_abs, ok = [], -1, True
        for i, r in enumerate(rows):
            day_off = (int(r.get("day") or 1) - 1) * 1440
            arr = hhmm_to_min(r["arrival"])
            dep = hhmm_to_min(r["departure"])
            is_end = i == 0 or i == len(rows) - 1
            if not is_end and arr == dep:
                continue  # pass-through point, not a halt
            arr_abs = None if arr is None or i == 0 else arr + day_off
            dep_abs = None if dep is None or i == len(rows) - 1 else dep + day_off
            # schedule "day" is the arrival day; a departure after midnight rolls over
            if arr_abs is not None and dep_abs is not None and dep_abs < arr_abs:
                dep_abs += 1440
            t = arr_abs if arr_abs is not None else dep_abs
            if t is None or t < last_abs:
                ok = False
                break
            last_abs = dep_abs if dep_abs is not None else t
            if r["station_code"] not in stations:
                continue
            stops.append([r["station_code"], arr_abs, dep_abs, round(cum[i] * scale)])

        if not ok or len(stops) < 2:
            continue
        # make sure the kept origin/terminus carry departure/arrival times
        if stops[0][2] is None or stops[-1][1] is None:
            continue
        classes = [code for key, code in CLASS_FLAGS.items() if p.get(key)]
        trains[p["number"]] = {
            "name": p["name"],
            "type": p.get("type") or "",
            "classes": classes,
            "distance": p.get("distance") or stops[-1][3],
            "stops": stops,
        }

    used = {s[0] for t in trains.values() for s in t["stops"]}
    stations = {c: v for c, v in stations.items() if c in used}

    out.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(out, "wt", encoding="utf-8") as fh:
        json.dump({"stations": stations, "trains": trains}, fh, separators=(",", ":"))
    print(f"{len(trains)} trains, {len(stations)} stations -> {out} ({out.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
