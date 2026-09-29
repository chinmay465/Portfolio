"""scripts/crawl_railradar.py against the fake RailRadar API from test_live."""

import gzip
import json
import sys
from pathlib import Path

from app.timetable import StaticTimetable

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import crawl_railradar as crawl  # noqa: E402
from test_live import NEW_TRAIN, NOT_TUESDAY, WITHDRAWN, Fake, client_for  # noqa: E402

BASE = {
    "meta": {"source": "base snapshot", "as_of": "2024-09", "run_days": True},
    "stations": {c: list(v) for c, v in json.load(gzip.open(crawl.DEFAULT_DATA, "rt"))["stations"].items()},
    "trains": {},
}
full = json.load(gzip.open(crawl.DEFAULT_DATA, "rt"))["trains"]
for n in ["11014", "17307", "12158", WITHDRAWN, "12627"]:
    if n in full:
        BASE["trains"][n] = full[n]
BASE["trains"][WITHDRAWN] = BASE["trains"].get(WITHDRAWN) or full["11014"]


def load(path):
    return StaticTimetable(path)


def test_crawl_resumes_within_budget_and_merges(tmp_path):
    fake, naps = Fake(), []
    rr = client_for(fake, tmp_path)
    out = tmp_path / "tt.json.gz"
    logs = []

    first = crawl.run(rr, BASE, out, rpm=9, budget=2, stations=0, sleep=naps.append, log=logs.append)
    assert fake.calls == 2 and not first["meta"]["complete"]
    assert naps == [60 / 9] * 2  # paced between real requests
    assert first["meta"]["as_of"] == "2024-09" and "the rest from base snapshot" in first["meta"]["source"]

    second = crawl.run(rr, first, out, rpm=9, budget=100_000, stations=200, sleep=naps.append, log=logs.append)
    assert second["meta"]["complete"]
    assert second["meta"]["base"] == "base snapshot"
    assert WITHDRAWN not in second["trains"]  # 404 on RailRadar
    assert NEW_TRAIN["number"] in second["trains"]  # found on a station board
    assert second["trains"][NOT_TUESDAY]["days"] == [0, 3]
    assert second["trains"]["17307"]["stops"][3] == ["SUR", 1810, 1820, 800]

    tt = load(out)
    assert tt.train(NOT_TUESDAY).runs_on == frozenset({0, 3})
    assert tt.meta["complete"] is True

    calls = fake.calls
    crawl.run(rr, second, out, rpm=9, budget=100_000, stations=0, sleep=naps.append, log=logs.append)
    assert fake.calls == calls  # everything cached: a re-run is free


def test_crawl_stops_on_quota(tmp_path):
    import httpx

    def quota(request):
        return httpx.Response(429, json={"success": False, "message": "Monthly quota exceeded, upgrade your plan"})

    rr = client_for(quota, tmp_path)
    data = crawl.run(rr, BASE, tmp_path / "tt.json.gz", rpm=9, budget=100, stations=0, sleep=lambda s: None, log=lambda m: None)
    assert not data["meta"]["complete"]
    assert set(data["trains"]) == set(BASE["trains"])  # nothing lost
