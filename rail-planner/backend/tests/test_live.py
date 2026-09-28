"""Live (RailRadar) path, against a fake API that speaks the documented response shapes.

The fake is built from the snapshot, then altered the way the real world drifts:
a train withdrawn, a train that no longer runs daily, and a brand-new train.
"""

from datetime import date

import httpx
import pytest
from fastapi.testclient import TestClient

from app import main
from app.railradar import RailRadar, classes_from_coaches
from app.search import SearchParams, search
from app.timetable import StaticTimetable

TT = StaticTimetable()
TUESDAY = date(2026, 10, 20)
assert TUESDAY.weekday() == 1

WITHDRAWN = "16530"  # SBC-PUNE direct in the snapshot
NOT_TUESDAY = "11014"  # SBC-PUNE direct; make it Mon/Thu only
NEW_TRAIN = {"number": "20671", "name": "Test Vande Bharat", "type": "Vande Bharat", "runDays": ["tue", "sun"]}
DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def hhmm(m):
    m %= 1440
    return f"{m // 60:02d}:{m % 60:02d}"


def run_days(number):
    return ["mon", "thu"] if number == NOT_TUESDAY else DAYS


def between(a, b):
    trains = []
    for t, i in TT.trains_at(a):
        if t.number == WITHDRAWN:
            continue
        s = t.stops[i]
        if s.dep is None:
            continue
        for j in range(i + 1, len(t.stops)):
            e = t.stops[j]
            if e.code == b and e.arr is not None:
                trains.append(
                    {
                        "train": {"number": t.number, "name": t.name, "type": "Superfast Express", "runDays": run_days(t.number)},
                        "from": {"departure": hhmm(s.dep), "day": s.dep // 1440 + 1, "sequence": i + 1},
                        "to": {"arrival": hhmm(e.arr), "day": e.arr // 1440 + 1, "sequence": j + 1},
                        "distance": float(e.km - s.km),
                        "duration": e.arr - s.dep,
                        "totalHaltsBetween": j - i - 1,
                    }
                )
                break
    if (a, b) == ("SBC", "PUNE"):
        trains.append(
            {
                "train": NEW_TRAIN,
                "from": {"departure": "05:30", "day": 1, "sequence": 1},
                "to": {"arrival": "23:10", "day": 1, "sequence": 9},
                "distance": 960.0,
                "duration": 1060,
                "totalHaltsBetween": 7,
            }
        )
    return {"success": True, "data": {"from": {"code": a}, "to": {"code": b}, "count": len(trains), "trains": trains}}


def train_detail(number):
    t = TT.train(number)
    if not t:
        return None
    route = [
        {
            "sequence": k + 1,
            "station": {"code": s.code, "name": TT.station(s.code).name},
            "arrival": hhmm(s.arr) if s.arr is not None else None,
            "departure": hhmm(s.dep) if s.dep is not None else None,
            "arrivalDay": (s.arr if s.arr is not None else s.dep) // 1440 + 1,
            "departureDay": (s.dep if s.dep is not None else s.arr) // 1440 + 1,
            "distance": s.km,
            "isHalt": True,
        }
        for k, s in enumerate(t.stops)
    ]
    train = {"number": t.number, "name": t.name, "type": "Superfast Express", "runDays": run_days(number),
             "coachPosition": "Engine-H1-A1-B1-B2-S1-S2-S3-GS"}
    return {"success": True, "data": {"train": train, "route": route}}


class Fake:
    def __init__(self, status=200):
        self.calls = 0
        self.status = status

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.calls += 1
        assert request.headers["authorization"] == "Bearer rr_live_test"
        if self.status != 200:
            return httpx.Response(self.status, json={"success": False})
        parts = request.url.path.split("/")  # /v1/trains/between/A/B  or  /v1/trains/N
        if parts[3] == "between":
            return httpx.Response(200, json=between(parts[4], parts[5]))
        body = train_detail(parts[3])
        return httpx.Response(200 if body else 404, json=body or {"success": False})


def client_for(fake, tmp_path):
    http = httpx.Client(
        base_url="https://api.railradar.in/v1",
        headers={"Authorization": "Bearer rr_live_test"},
        transport=httpx.MockTransport(fake),
    )
    return RailRadar("rr_live_test", cache_path=tmp_path / "cache.sqlite3", client=http,
                     class_hint=lambda n: TT.train(n).classes if TT.train(n) else ())


def numbers(res, key):
    return {leg["train"]["number"] for j in res[key] for leg in j["legs"]}


def test_live_uses_current_trains_and_running_days(tmp_path):
    fake = Fake()
    res = search(TT, SearchParams("SBC", "PUNE", TUESDAY), client_for(fake, tmp_path))
    assert res["data_source"]["kind"] == "live"
    direct = numbers(res, "direct")
    assert NEW_TRAIN["number"] in direct  # new train appears
    assert WITHDRAWN not in direct  # withdrawn train gone
    assert NOT_TUESDAY not in direct  # doesn't run on Tuesdays
    assert res["alternates"], "expected live alternates"
    new = next(j for j in res["direct"] if j["legs"][0]["train"]["number"] == NEW_TRAIN["number"])
    assert new["legs"][0]["train"]["runs_on"] == ["Tue", "Sun"]
    assert new["depart_at"].startswith("2026-10-20T05:30")


def test_every_live_leg_runs_on_its_date(tmp_path):
    res = search(TT, SearchParams("SBC", "PUNE", TUESDAY), client_for(Fake(), tmp_path))
    names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    for j in res["direct"] + res["alternates"]:
        for leg in j["legs"]:
            origin = date.fromisoformat(leg["origin_date"])
            assert names[origin.weekday()] in leg["train"]["runs_on"]


def test_cache_makes_repeat_searches_free(tmp_path):
    fake = Fake()
    rr = client_for(fake, tmp_path)
    first = search(TT, SearchParams("SBC", "PUNE", TUESDAY), rr)
    n = fake.calls
    assert 1 < n <= 1 + 2 * 2 + 6 * 2  # direct + nearby + hubs
    assert first["data_source"]["requests"] == n
    second = search(TT, SearchParams("SBC", "PUNE", date(2026, 10, 22)), rr)
    assert fake.calls == n  # different date, same cached pairs
    assert second["data_source"]["requests"] == 0
    assert second["data_source"]["cache_hits"] == n
    assert rr.month_requests() == n


def test_bad_key_falls_back_to_snapshot(tmp_path):
    res = search(TT, SearchParams("SBC", "PUNE", TUESDAY), client_for(Fake(status=401), tmp_path))
    assert res["data_source"]["kind"] == "snapshot"
    assert "rejected the API key" in res["data_source"]["warnings"][0]
    assert res["direct"]


def test_classes_from_coach_position():
    assert classes_from_coaches("Engine-H1-A1-B1-B2-M1-S1-S2-GS-SLR") == ("1A", "2A", "3A", "3E", "SL")
    assert classes_from_coaches("L-C1-C2-E1") == ("EC", "CC")
    assert classes_from_coaches(None) == ()


@pytest.fixture
def api_with_live(tmp_path, monkeypatch):
    rr = client_for(Fake(), tmp_path)
    monkeypatch.setattr(main, "live", lambda: rr)
    return TestClient(main.app)


def test_booking_windows_flags_non_running_day(api_with_live):
    r = api_with_live.get("/api/booking-windows", params={"date": "2026-10-20", "train": NOT_TUESDAY, "board": "SBC"}).json()
    assert r["data_source"]["kind"] == "live"
    assert r["train"]["runs_on"] == ["Mon", "Thu"]
    assert r["train"]["runs_on_date"] is False
    assert r["train"]["classes"] == ["1A", "2A", "3A", "SL"]
    ok = api_with_live.get("/api/booking-windows", params={"date": "2026-10-19", "train": NOT_TUESDAY, "board": "SBC"}).json()
    assert ok["train"]["runs_on_date"] is True


def test_status_endpoint(api_with_live):
    assert api_with_live.get("/api/status").json()["source"] == "live"
