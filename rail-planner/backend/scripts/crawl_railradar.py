"""Refresh the bundled timetable from RailRadar, slowly enough to stay inside its rate limit.

One request per train (GET /v1/trains/{number}): full route, times, distances and running days.
The train list is every train in the current snapshot, plus any new ones found on the station
boards of the busiest stations (--stations N, one request per station; use it on the first run,
since later runs rank stations on the grown timetable and scan different boards).

    cd backend
    RAILRADAR_API_KEY=rr_live_... python scripts/crawl_railradar.py --max 900
    # re-run until it says "complete", then commit data/timetable.json.gz

    # Only add trains that started since the snapshot (cheap: boards + the new trains):
    RAILRADAR_API_KEY=rr_live_... python scripts/crawl_railradar.py --new-only --stations 300

Every response is cached in data/railradar-crawl.sqlite3 (git-ignored, kept 45 days), so the
crawl can be stopped and resumed and spread over several days or months of quota: each run only
spends requests on trains it hasn't fetched yet. After every run the output is rewritten:
crawled trains replace their snapshot entries, trains RailRadar no longer knows are dropped, and
trains not crawled yet keep their snapshot entry. At 9 requests a minute ~4,000 trains take
about 7.5 hours of requests.
"""

from __future__ import annotations

import argparse
import gzip
import json
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path[:0] = [str(ROOT), str(ROOT / "scripts")]

from app.railradar import LiveError, RailRadar, Usage  # noqa: E402
from app.timetable import DEFAULT_DATA  # noqa: E402
from build_timetable_2024 import place_missing  # noqa: E402

CACHE = ROOT / "data" / "railradar-crawl.sqlite3"
QUOTA_WORDS = ("month", "quota", "plan limit", "upgrade")


def to_stops(route: list[dict]) -> list[list] | None:
    """RailRadar route -> [[code, arr, dep, km], ...] in minutes from origin-day 00:00."""
    stops = []
    for i, r in enumerate(route):
        arr = None if i == 0 or r["arr"] is None else r["arr"] + (r["arr_day"] - 1) * 1440
        dep = None if i == len(route) - 1 or r["dep"] is None else r["dep"] + (r["dep_day"] - 1) * 1440
        if r["code"] and (arr is not None or dep is not None):
            stops.append([r["code"], arr, dep, r["km"]])
    if len(stops) < 2 or stops[0][2] is None or stops[-1][1] is None:
        return None
    return stops


def to_train(detail: dict) -> dict | None:
    stops = to_stops(detail["route"])
    if not stops:
        return None
    m = detail["meta"]
    return {
        "name": m.name,
        # snapshot rule: a train is reserved when it has classes or a long-distance type code
        "type": (m.type or "Exp") if not m.reserved or m.classes else "Exp",
        "classes": list(m.classes) if m.reserved else [],
        "distance": stops[-1][3],
        "days": sorted(m.runs_on),
        "stops": stops,
    }


class Crawler:
    def __init__(self, rr: RailRadar, rpm: float, budget: int, sleep=time.sleep, log=print) -> None:
        self.rr, self.gap, self.budget, self.sleep, self.log = rr, 60 / rpm, budget, sleep, log
        self.spent = 0
        self.stopped = ""  # why the run ended early, if it did

    def call(self, fn, *args):
        """fn(*args, usage) with pacing; None when the run must stop (budget, quota, repeated errors)."""
        if self.stopped:
            return None
        if self.spent >= self.budget:
            self.stopped = f"request budget of {self.budget} used"
            return None
        usage = Usage()
        try:
            out = fn(*args, usage)
        except LiveError as e:
            self.spent += usage.requests
            if any(w in str(e).lower() for w in QUOTA_WORDS) or "refused" in str(e):
                self.stopped = str(e)
            else:
                self.log(f"  {args[0]}: {e}")
            return None
        if usage.requests:
            self.spent += usage.requests
            self.sleep(self.gap * usage.requests)
        return out, usage.requests

    def discover(self, stations: list[str]) -> set[str]:
        found: set[str] = set()
        for code in stations:
            got = self.call(self.rr.station_board, code)
            if got is None:
                if self.stopped:
                    break
                continue
            found |= set(got[0])
        return found

    def trains(self, numbers: list[str]) -> dict[str, dict | None]:
        """number -> detail, or None when RailRadar doesn't know it. Stops early on budget/quota."""
        out: dict[str, dict | None] = {}
        for i, number in enumerate(numbers, 1):
            got = self.call(self.rr.train, number)
            if got is None:
                if self.stopped:
                    break
                continue  # transient error: retried next run
            out[number] = got[0]
            if got[1] and i % 50 == 0:
                self.log(f"  {i}/{len(numbers)} trains, {self.spent} requests this run")
        return out


def merge(base: dict, fetched: dict[str, dict | None], total: int, new_only: bool = False) -> dict:
    trains = dict(base["trains"])
    stations = {c: list(v) for c, v in base["stations"].items()}
    names: dict[str, str] = {}
    gone = 0
    for number, detail in fetched.items():
        t = to_train(detail) if detail else None
        if t is None:
            gone += trains.pop(number, None) is not None
            continue
        trains[number] = t
        names.update({r["code"]: r["name"] for r in detail["route"] if r["code"]})
    for code, name in names.items():
        if code in stations:
            stations[code][0] = name
    place_missing(stations, trains, {**{c: v[0] for c, v in stations.items()}, **names})
    for t in trains.values():
        t["stops"] = [s for s in t["stops"] if s[0] in stations]
    trains = {n: t for n, t in trains.items() if len(t["stops"]) >= 2}
    used = {s[0] for t in trains.values() for s in t["stops"]}

    crawled = sum(1 for d in fetched.values() if d)
    today = datetime.now().strftime("%Y-%m-%d")
    base_meta = base.get("meta") or {}
    if new_only:
        # Existing trains untouched; record which trains were added and when.
        added = sorted(n for n in fetched if n not in base["trains"] and n in trains)
        meta = {
            **base_meta,
            "built": today,
            "new_trains_checked": today,
            "added": sorted(set(base_meta.get("added", [])) | set(added)),
            "trains": len(trains),
            "stations": len(used),
        }
        return {"meta": meta, "stations": {c: v for c, v in stations.items() if c in used}, "trains": trains}
    origin = base_meta.get("base") or base_meta.get("source") or "the previous snapshot"  # stays put across resumed runs
    complete = len(fetched) >= total
    meta = {
        "source": f"RailRadar, {crawled} trains crawled up to {today}"
        + ("" if complete else f"; the rest from {origin}"),
        "as_of": today[:7] if complete else base_meta.get("as_of"),
        "run_days": True,
        "built": today,
        "crawled": crawled,
        "withdrawn": gone,
        "complete": complete,
        "base": origin,
        "trains": len(trains),
        "stations": len(used),
    }
    return {"meta": meta, "stations": {c: v for c, v in stations.items() if c in used}, "trains": trains}


def busiest(base: dict, n: int) -> list[str]:
    count: dict[str, int] = {}
    for t in base["trains"].values():
        for s in t["stops"]:
            count[s[0]] = count.get(s[0], 0) + 1
    return sorted(count, key=lambda c: -count[c])[:n]


def run(
    rr: RailRadar, base: dict, out: Path, rpm: float, budget: int, stations: int, sleep=time.sleep, log=print,
    new_only: bool = False,
) -> dict:
    crawler = Crawler(rr, rpm, budget, sleep, log)
    known = set(base["trains"])
    numbers = [] if new_only else sorted(known)
    if stations:
        log(f"Looking for new trains on the boards of the {stations} busiest stations")
        new = sorted(crawler.discover(busiest(base, stations)) - known)
        log(f"  {len(new)} train numbers not in the timetable yet")
        numbers += new
    log(f"Fetching {len(numbers)} trains at {rpm:g} requests/min")
    fetched = crawler.trains(numbers)
    data = merge(base, fetched, len(numbers), new_only)
    out.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(out, "wt", encoding="utf-8") as fh:
        json.dump(data, fh, separators=(",", ":"))
    m = data["meta"]
    done = len(fetched) >= len(numbers) and not crawler.stopped
    state = "complete" if done else f"stopped: {crawler.stopped}. Run again to continue"
    if new_only:
        added = [n for n in fetched if n not in known and n in data["trains"]]
        log(f"Added {len(added)} new trains ({', '.join(added[:30])}{'…' if len(added) > 30 else ''}); "
            f"{crawler.spent} requests this run; {state}")
    else:
        log(f"{len(fetched)}/{len(numbers)} trains done, {m['withdrawn']} withdrawn, {crawler.spent} requests this run; {state}")
    log(f"Wrote {m['trains']} trains, {m['stations']} stations -> {out}")
    return data


def main() -> None:
    import os

    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--rpm", type=float, default=9, help="requests per minute (RailRadar allows 10)")
    ap.add_argument("--max", type=int, default=900, help="stop after this many requests (monthly quota)")
    ap.add_argument("--stations", type=int, default=0, help="also scan the N busiest station boards for new trains")
    ap.add_argument("--new-only", action="store_true", help="only add trains not in the timetable yet (needs --stations)")
    ap.add_argument("--base", type=Path, default=DEFAULT_DATA, help="snapshot to start from")
    ap.add_argument("--out", type=Path, default=DEFAULT_DATA)
    ap.add_argument("--ttl-days", type=float, default=45, help="re-fetch trains cached longer ago than this")
    args = ap.parse_args()

    key = os.getenv("RAILRADAR_API_KEY", "").strip()
    if not key:
        sys.exit("Set RAILRADAR_API_KEY")
    with gzip.open(args.base, "rt", encoding="utf-8") as fh:
        base = json.load(fh)
    rr = RailRadar(key, cache_path=CACHE, ttl_seconds=int(args.ttl_days * 86400))
    if args.new_only and not args.stations:
        sys.exit("--new-only needs --stations N (new trains are found on station boards)")
    run(rr, base, args.out, args.rpm, args.max, args.stations, new_only=args.new_only)


if __name__ == "__main__":
    main()
