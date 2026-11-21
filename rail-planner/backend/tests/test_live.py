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
from app.railradar import Usage
from app.search import SearchParams, _live_candidates, search
from app.timetable import StaticTimetable


def _direct(body):
    return [j for j in body["results"] if j["kind"] == "direct"]


def _alts(body):
    return [j for j in body["results"] if j["kind"] != "direct"]


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


SEAT_STATUS = {("17307", "3A"): "AVAILABLE-0012", ("12158", "CC"): "GNWL24/WL11", ("12158", "2S"): "RAC 4",
               ("11014", "SL"): "REGRET/WL"}
SEAT_CALLS: list[dict] = []


def seats_body(number, params):
    """RailRadar-shaped 14-day window (note the API's 'availablity' spelling)."""
    from datetime import timedelta as td

    SEAT_CALLS.append({"train": number, **params})
    start = date.fromisoformat(params["journeyDate"])
    status = SEAT_STATUS.get((number, params["classCode"]), "AVAILABLE-0045")
    rows = [
        {"availablityDate": (start + td(days=i)).isoformat(), "availablityStatus": status if i == 0 else "WL#3",
         "prediction": "LOW" if "WL" in status else "CONFIRMED", "predictionPercentage": 25 if "WL" in status else 100}
        for i in range(14)
    ]
    return {"success": True, "data": {"trainNumber": number, "classCode": params["classCode"],
                                      "quotaCode": params["quotaCode"], "availability": rows}}


class Fake:
    def __init__(self, status=200):
        self.calls = 0
        self.status = status

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.calls += 1
        assert request.headers["authorization"] == "Bearer rr_live_test"
        if self.status != 200:
            return httpx.Response(self.status, json={"success": False})
        parts = request.url.path.split("/")  # /v1/stations/CODE/trains  or  /v1/trains/N[/seats]
        if len(parts) > 4 and parts[4] == "seats":
            return httpx.Response(200, json=seats_body(parts[3], dict(request.url.params)))
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
    group = _direct(res) if key == "direct" else _alts(res)
    return {leg["train"]["number"] for j in group for leg in j["legs"]}


def test_live_uses_current_trains_and_running_days(tmp_path):
    fake = Fake()
    res = search(TT, SearchParams("SBC", "PUNE", TUESDAY), client_for(fake, tmp_path))
    assert res["data_source"]["kind"] == "live"
    direct = numbers(res, "direct")
    assert NEW_TRAIN["number"] in direct  # new train appears
    assert WITHDRAWN not in direct  # withdrawn train gone
    assert NOT_TUESDAY not in direct  # doesn't run on Tuesdays
    assert _alts(res), "expected live alternates"
    new = next(j for j in _direct(res) if j["legs"][0]["train"]["number"] == NEW_TRAIN["number"])
    assert new["legs"][0]["train"]["runs_on"] == ["Tue", "Sun"]
    assert new["depart_at"].startswith("2026-10-20T05:30")


def test_every_live_leg_runs_on_its_date(tmp_path):
    res = search(TT, SearchParams("SBC", "PUNE", TUESDAY), client_for(Fake(), tmp_path))
    names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    for j in _direct(res) + _alts(res):
        for leg in j["legs"]:
            origin = date.fromisoformat(leg["origin_date"])
            assert names[origin.weekday()] in leg["train"]["runs_on"]


def test_cache_makes_repeat_searches_free(tmp_path):
    fake = Fake()
    rr = client_for(fake, tmp_path)
    first = search(TT, SearchParams("SBC", "PUNE", TUESDAY), rr)
    n = fake.calls
    assert 1 < n <= 2 + 2 * 2 + 10 + 16  # one board each: ends + nearby + hubs + multi-change hubs
    assert first["data_source"]["requests"] == n
    second = search(TT, SearchParams("SBC", "PUNE", date(2026, 10, 22)), rr)
    assert fake.calls == n  # different date, same cached pairs
    assert second["data_source"]["requests"] == 0
    assert second["data_source"]["cache_hits"] == n
    assert rr.month_requests() == n


def test_bad_key_falls_back_to_snapshot(tmp_path):
    res = search(TT, SearchParams("SBC", "PUNE", TUESDAY), client_for(Fake(status=401), tmp_path))
    assert res["data_source"]["kind"] == "snapshot"
    assert "refused the request (HTTP 401)" in res["data_source"]["warnings"][0]
    assert _direct(res)


def test_classes_from_coach_position():
    assert classes_from_coaches("Engine-H1-A1-B1-B2-M1-S1-S2-GS-SLR") == ("1A", "2A", "3A", "3E", "SL")
    assert classes_from_coaches("L-C1-C2-E1") == ("EC", "CC")
    assert classes_from_coaches(None) == ()


@pytest.fixture
def api_with_live(tmp_path, monkeypatch):
    rr = client_for(Fake(), tmp_path)
    monkeypatch.setattr(main, "live", lambda: rr)
    monkeypatch.setenv("TIMETABLE_SOURCE", "live")
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


def test_default_timetable_is_snapshot_but_seats_stay_live(tmp_path, monkeypatch):
    """Routes come from the stored timetable (no RailRadar calls); seat checks still use the key."""
    fake = Fake()
    rr = client_for(fake, tmp_path)
    monkeypatch.setattr(main, "live", lambda: rr)
    monkeypatch.delenv("TIMETABLE_SOURCE", raising=False)
    api = TestClient(main.app)
    body = api.get("/api/routes", params={"from": "SBC", "to": "PUNE", "date": "2026-10-20"}).json()
    assert body["data_source"]["kind"] == "snapshot"
    assert body["data_source"]["run_days"] is True
    assert body["data_source"]["live_configured"] is True
    assert fake.calls == 0
    status = api.get("/api/status").json()
    assert status["source"] == "snapshot" and status["seats"] == "RailRadar"
    seats = api.get("/api/seats", params={"train": "17307", "from": "SBC", "to": "SUR", "date": "2026-10-20"}).json()
    assert seats["source"] == "live" and fake.calls == 1


def _connections(p: SearchParams, tmp_path):
    """Live one-change candidates, before the results list caps routes per change station."""
    a, b = TT.station(p.from_code), TT.station(p.to_code)
    near_a = {s.code for s, _ in TT.nearby(a.code, p.nearby_km)}
    near_b = {s.code for s, _ in TT.nearby(b.code, p.nearby_km)}
    rr = client_for(Fake(), tmp_path)
    return _live_candidates(TT, rr, a, b, near_a, near_b, p, Usage(), [])[2]


def test_basava_hutatma_change_at_solapur(tmp_path):
    """Regression: 17307 SBC 16:40 -> SUR 06:10, then 12158 SUR 06:30 -> PUNE 10:30 (20-minute change).

    The snapshot's 2016 timings made this change impossible, which used to drop Solapur from the
    live hub list; the default 45-minute change time also hid it.
    """
    match = [
        j for j in _connections(SearchParams("SBC", "PUNE", TUESDAY), tmp_path)
        if [leg.train.number for leg in j.legs] == ["17307", "12158"]
    ]
    assert match, "Basava -> Hutatma via Solapur missing"
    j = match[0]
    assert j.legs[0].to_code == "SUR" and j.legs[0].from_code == "SBC"
    assert (j.legs[1].depart_at - j.legs[0].arrive_at).total_seconds() == 20 * 60
    assert j.depart_at.isoformat().startswith("2026-10-20T16:40") and j.arrive_at.isoformat().startswith("2026-10-21T10:30")

    strict = _connections(SearchParams("SBC", "PUNE", TUESDAY, min_transfer_min=30), tmp_path / "b")
    assert not any([l.train.number for l in j2.legs] == ["17307", "12158"] for j2 in strict)


def test_live_multi_change_via(tmp_path):
    fake = Fake()
    p = SearchParams("SBC", "PUNE", TUESDAY, extra_hours=None, extra_km=None, max_changes=3, via=("SRR", "MAQ", "TNA"))
    res = search(TT, p, client_for(fake, tmp_path))
    assert res["data_source"]["kind"] == "live"
    assert _alts(res), "expected a live route via SRR, MAQ, TNA"
    for j in _alts(res):
        assert j["changes"] <= 3
        for leg in j["legs"]:
            origin = date.fromisoformat(leg["origin_date"])
            assert ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][origin.weekday()] in leg["train"]["runs_on"]
    assert fake.calls <= 40  # one board per station, even with via + multi-change hubs


def test_seat_availability_endpoint(api_with_live):
    SEAT_CALLS.clear()
    legs = [
        {"train": "17307", "from": "SBC", "to": "SUR", "date": "2026-10-20", "classes": ["2A", "3A", "SL"]},
        {"train": "12158", "from": "SUR", "to": "PUNE", "date": "2026-10-21", "classes": ["CC", "2S"]},
    ]
    r = api_with_live.post("/api/seats", json={"cls": "3A", "quota": "GN", "legs": legs}).json()
    first, second = r["results"]
    assert first["category"] == "available" and first["count"] == 12 and first["raw"] == "AVAILABLE-0012"
    assert first["checked_cls"] == "3A"
    # Hutatma has no 3A: the closest class it does have (CC) is checked instead, and labelled as such.
    assert second["checked_cls"] == "CC" and second["cls"] == "3A" and second["category"] == "waitlist"
    assert SEAT_CALLS[0] == {"train": "17307", "source": "SBC", "destination": "SUR", "journeyDate": "2026-10-20",
                             "classCode": "3A", "quotaCode": "GN"}
    assert SEAT_CALLS[1]["classCode"] == "CC"
    none = api_with_live.post("/api/seats", json={"cls": "1A", "legs": [{**legs[1], "classes": ["2S"]}]}).json()
    assert none["results"][0]["category"] == "no_class" and none["requests"] == 0

    wl = api_with_live.post("/api/seats", json={"cls": "CC", "quota": "GN", "legs": legs[1:]}).json()["results"][0]
    assert wl["category"] == "waitlist" and wl["count"] == 11 and wl["prediction_pct"] == 25

    again = api_with_live.post("/api/seats", json={"cls": "3A", "quota": "GN", "legs": legs[:1]}).json()
    assert again["requests"] == 0 and again["cache_hits"] == 1  # cached for SEATS_TTL
    assert again["results"][0]["checked_at"]


def test_seats_pick_the_right_date_from_the_window(api_with_live):
    # The fake returns AVAILABLE on the requested date and WL#3 on later dates.
    r = api_with_live.post("/api/seats", json={"cls": "3A", "legs": [
        {"train": "17307", "from": "SBC", "to": "SUR", "date": "2026-10-22"}]}).json()
    assert r["results"][0]["category"] == "available"


def test_seats_without_live_key():
    client = TestClient(main.app)
    r = client.post("/api/seats", json={"legs": [{"train": "17307", "from": "SBC", "to": "SUR", "date": "2026-10-20"}]})
    assert r.status_code == 200 and r.json()["source"] is None


def test_seat_refresh_bypasses_cache(api_with_live):
    leg = [{"train": "17307", "from": "SBC", "to": "SUR", "date": "2026-10-25"}]
    assert api_with_live.post("/api/seats", json={"legs": leg}).json()["requests"] == 1
    assert api_with_live.post("/api/seats", json={"legs": leg}).json()["requests"] == 0
    assert api_with_live.post("/api/seats", json={"legs": leg, "fresh": True}).json()["requests"] == 1


class Flaky(Fake):
    """429 for the first `n` calls, with a RailRadar-style message, then normal."""

    def __init__(self, n, message="Too many requests, slow down"):
        super().__init__()
        self.n, self.message = n, message

    def __call__(self, request):
        if self.n > 0:
            self.n -= 1
            self.calls += 1
            return httpx.Response(429, json={"success": False, "meta": {"message": self.message}})
        return super().__call__(request)


def test_rate_limit_is_retried(tmp_path, monkeypatch):
    import app.railradar as rr_mod

    monkeypatch.setattr(rr_mod, "BACKOFF", 0.01)
    fake = Flaky(2)
    rr = client_for(fake, tmp_path)
    res = rr.seats("17307", "SBC", "SUR", "2026-10-20", "3A")
    assert res["rows"] and fake.calls == 3  # two 429s, then success


def test_rate_limit_gives_up_with_real_message(tmp_path, monkeypatch):
    import app.railradar as rr_mod
    from app.railradar import LiveError

    monkeypatch.setattr(rr_mod, "BACKOFF", 0.01)
    rr = client_for(Flaky(10), tmp_path)
    with pytest.raises(LiveError, match="rate limit .*Too many requests, slow down"):
        rr.seats("17307", "SBC", "SUR", "2026-10-20", "3A")


def test_monthly_quota_stops_further_calls(tmp_path):
    from app.railradar import LiveError

    fake = Flaky(10, "Request rate exceeded your plan quota (1,000 requests/month on free sandbox tier).")
    rr = client_for(fake, tmp_path)
    with pytest.raises(LiveError, match="monthly quota used up"):
        rr.seats("17307", "SBC", "SUR", "2026-10-20", "3A")
    calls = fake.calls
    with pytest.raises(LiveError, match="monthly quota used up"):
        rr.station_board("SBC")
    assert fake.calls == calls == 1  # no retries, no further requests this month


def test_seat_errors_are_reported_per_leg(api_with_live, monkeypatch):
    import app.railradar as rr_mod

    monkeypatch.setattr(rr_mod, "BACKOFF", 0.01)
    client = main.live()
    real = client._client
    client._client = httpx.Client(base_url="https://api.railradar.in/v1", headers=dict(real.headers),
                                  transport=httpx.MockTransport(Flaky(99)))
    try:
        r = api_with_live.get("/api/seats", params={"train": "17307", "from": "SBC", "to": "SUR", "date": "2026-11-02"}).json()
    finally:
        client._client = real
    leg = r["results"][0]
    assert leg["category"] == "unknown" and "Too many requests" in leg["error"]


def test_seat_class_per_leg(api_with_live):
    SEAT_CALLS.clear()
    legs = [
        {"train": "17307", "from": "SBC", "to": "SUR", "date": "2026-11-05", "classes": ["2A", "3A", "SL"], "cls": "SL"},
        {"train": "12158", "from": "SUR", "to": "PUNE", "date": "2026-11-06", "classes": ["CC", "2S"], "cls": "2S"},
    ]
    r = api_with_live.post("/api/seats", json={"quota": "GN", "legs": legs}).json()["results"]
    assert [x["cls"] for x in r] == ["SL", "2S"] and [x["checked_cls"] for x in r] == ["SL", "2S"]
    assert [c["classCode"] for c in SEAT_CALLS] == ["SL", "2S"] or sorted(c["classCode"] for c in SEAT_CALLS) == ["2S", "SL"]
