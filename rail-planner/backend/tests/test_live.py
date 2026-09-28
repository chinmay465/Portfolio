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


def t(h, m, day=1):
    return (day - 1) * 1440 + h * 60 + m


def run_days(number):
    return ["mon", "thu"] if number == NOT_TUESDAY else DAYS


# The "current" railway: snapshot trains, minus a withdrawn one, plus today's timings for the
# Basava -> Hutatma change at Solapur (arrive 06:10, depart 06:30) and a brand-new train.
# Each train: meta dict + [(code, arr, dep, km)] with times in minutes from origin-day 00:00.
WORLD: dict[str, tuple[dict, list]] = {}
for tr in TT._trains.values():
    if tr.number == WITHDRAWN:
        continue
    meta = {"number": tr.number, "name": tr.name, "type": "Superfast Express", "runDays": run_days(tr.number)}
    WORLD[tr.number] = (meta, [(s.code, s.arr, s.dep, s.km) for s in tr.stops])
WORLD[NEW_TRAIN["number"]] = (NEW_TRAIN, [("SBC", None, t(5, 30), 0), ("PUNE", t(23, 10), None, 960)])
WORLD["17307"] = (
    {"number": "17307", "name": "Basava Express", "type": "Express", "runDays": DAYS},
    [("MYS", None, t(13, 25), 0), ("SBC", t(16, 30), t(16, 40), 139), ("YPR", t(16, 53), t(16, 55), 145),
     ("SUR", t(6, 10, 2), t(6, 20, 2), 800), ("BGK", t(10, 55, 2), None, 1015)],
)
WORLD["12158"] = (
    {"number": "12158", "name": "Hutatma Express", "type": "Superfast Express", "runDays": DAYS},
    [("SUR", None, t(6, 30), 0), ("DD", t(9, 3), t(9, 5), 185), ("PUNE", t(10, 30), None, 264)],
)

BOARDS: dict[str, list] = {}
for meta, stops in WORLD.values():
    for seq, (code, arr, dep, km) in enumerate(stops, 1):
        BOARDS.setdefault(code, []).append((meta, seq, arr, dep, km))


def station_board(code):
    trains = [
        {
            "train": meta,
            "stop": {
                "sequence": seq,
                "arrival": hhmm(arr) if arr is not None else None,
                "departure": hhmm(dep) if dep is not None else None,
                "arrivalDay": (arr if arr is not None else dep) // 1440 + 1,
                "departureDay": (dep if dep is not None else arr) // 1440 + 1,
                "distance": km,
                "stopType": "origin" if arr is None else "destination" if dep is None else "halt",
            },
        }
        for meta, seq, arr, dep, km in BOARDS.get(code, [])
    ]
    return {"success": True, "data": {"station": {"code": code}, "count": len(trains), "trains": trains}}


def train_detail(number):
    if number not in WORLD:
        return None
    meta, stops = WORLD[number]
    route = [
        {
            "sequence": k + 1,
            "station": {"code": code, "name": TT.station(code).name if TT.station(code) else code},
            "arrival": hhmm(arr) if arr is not None else None,
            "departure": hhmm(dep) if dep is not None else None,
            "arrivalDay": (arr if arr is not None else dep) // 1440 + 1,
            "departureDay": (dep if dep is not None else arr) // 1440 + 1,
            "distance": km,
            "isHalt": True,
        }
        for k, (code, arr, dep, km) in enumerate(stops)
    ]
    return {"success": True, "data": {"train": {**meta, "coachPosition": "Engine-H1-A1-B1-B2-S1-S2-S3-GS"}, "route": route}}


class Fake:
    def __init__(self, status=200):
        self.calls = 0
        self.status = status

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.calls += 1
        assert request.headers["authorization"] == "Bearer rr_live_test"
        if self.status != 200:
            return httpx.Response(self.status, json={"success": False})
        parts = request.url.path.split("/")  # /v1/stations/CODE/trains  or  /v1/trains/N
        if parts[2] == "stations":
            return httpx.Response(200, json=station_board(parts[3]))
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
    assert 1 < n <= 2 + 2 * 2 + 10  # one board each: ends + nearby + hubs
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


def test_basava_hutatma_change_at_solapur(tmp_path):
    """Regression: 17307 SBC 16:40 -> SUR 06:10, then 12158 SUR 06:30 -> PUNE 10:30 (20-minute change).

    The snapshot's 2016 timings made this change impossible, which used to drop Solapur from the
    live hub list; the default 45-minute change time also hid it.
    """
    res = search(TT, SearchParams("SBC", "PUNE", TUESDAY), client_for(Fake(), tmp_path))
    match = [
        j for j in res["alternates"]
        if [leg["train"]["number"] for leg in j["legs"]] == ["17307", "12158"]
    ]
    assert match, "Basava -> Hutatma via Solapur missing"
    j = match[0]
    assert j["transfer"]["station"]["code"] == "SUR"
    assert j["transfer"]["wait_minutes"] == 20 and j["transfer"]["tight"] is True
    assert j["legs"][0]["from"]["code"] == "SBC"
    assert j["depart_at"].startswith("2026-10-20T16:40") and j["arrive_at"].startswith("2026-10-21T10:30")

    strict = search(TT, SearchParams("SBC", "PUNE", TUESDAY, min_transfer_min=30), client_for(Fake(), tmp_path / "b"))
    assert not any([l["train"]["number"] for l in j2["legs"]] == ["17307", "12158"] for j2 in strict["alternates"])


def test_live_multi_change_via(tmp_path):
    fake = Fake()
    p = SearchParams("SBC", "PUNE", TUESDAY, extra_hours=None, extra_km=None, max_changes=3, via=("SRR", "MAQ", "TNA"))
    res = search(TT, p, client_for(fake, tmp_path))
    assert res["data_source"]["kind"] == "live"
    assert res["alternates"], "expected a live route via SRR, MAQ, TNA"
    for j in res["alternates"]:
        assert j["changes"] <= 3
        for leg in j["legs"]:
            origin = date.fromisoformat(leg["origin_date"])
            assert ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][origin.weekday()] in leg["train"]["runs_on"]
    assert fake.calls <= 40  # one board per station, even with via + multi-change hubs
