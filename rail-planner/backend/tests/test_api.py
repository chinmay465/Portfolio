from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
DATE = "2026-10-20"


def minutes(a: str, b: str) -> int:
    return int((datetime.fromisoformat(b) - datetime.fromisoformat(a)).total_seconds() // 60)


def test_station_search():
    r = client.get("/api/stations", params={"q": "pune"})
    assert r.status_code == 200
    assert r.json()[0]["code"] == "PUNE"


def test_defaults_are_2_changes_5h_100km():
    r = client.get("/api/routes", params={"from": "SBC", "to": "PUNE", "date": DATE})
    body = r.json()
    assert body["params"]["extra_hours"] == 5
    assert body["params"]["extra_km"] == 100
    assert body["params"]["max_changes"] == 2


@pytest.mark.parametrize("pair", [("SBC", "PUNE"), ("PUNE", "NGP"), ("CSTM", "NDLS")])
def test_alternates_respect_tolerance(pair):
    body = client.get("/api/routes", params={"from": pair[0], "to": pair[1], "date": DATE}).json()
    base = body["baseline"]
    assert base is not None
    assert body["alternates"], "expected at least one alternate"
    for j in body["alternates"]:
        assert j["minutes"] <= base["max_minutes"]
        assert j["km"] <= base["max_km"]
        assert j["kind"] in {"nearby", "connection"}


def test_tighter_tolerance_returns_fewer_alternates():
    loose = client.get("/api/routes", params={"from": "SBC", "to": "PUNE", "date": DATE, "extra_hours": 6, "extra_km": 300}).json()
    tight = client.get("/api/routes", params={"from": "SBC", "to": "PUNE", "date": DATE, "extra_hours": 0.5, "extra_km": 20}).json()
    assert len(tight["alternates"]) < len(loose["alternates"])


def test_connections_are_physically_consistent():
    body = client.get("/api/routes", params={"from": "SBC", "to": "PUNE", "date": DATE, "min_transfer_min": 60, "max_changes": 1}).json()
    conns = [j for j in body["alternates"] if j["kind"] == "connection"]
    assert conns
    for j in conns:
        l1, l2 = j["legs"]
        assert l1["to"]["code"] == l2["from"]["code"] == j["transfer"]["station"]["code"]
        wait = minutes(l1["arrive_at"], l2["depart_at"])
        assert wait == j["transfer"]["wait_minutes"] >= 60
        assert j["minutes"] == minutes(j["depart_at"], j["arrive_at"])
        assert j["km"] == l1["km"] + l2["km"]
        assert l1["depart_at"].startswith(DATE)


def test_each_reserved_leg_has_booking_windows():
    body = client.get("/api/routes", params={"from": "SBC", "to": "PUNE", "date": DATE}).json()
    for j in body["direct"] + body["alternates"]:
        for leg in j["legs"]:
            kinds = {w["kind"] for w in leg["booking_windows"]}
            assert "general" in kinds


def test_booking_windows_shift_for_day_two_boarding():
    # Karnataka Express leaves SBC on day 1 and reaches Bhopal on day 2 or later.
    info = client.get("/api/booking-windows", params={"date": DATE, "train": "12627", "board": "BPL"}).json()
    assert info["train"]["board_day"] >= 2
    assert info["origin_date"] < DATE


def test_bad_station():
    r = client.get("/api/routes", params={"from": "XXXX", "to": "PUNE", "date": DATE})
    assert r.status_code == 400


def test_no_upper_bounds_on_constraints():
    r = client.get(
        "/api/routes",
        params={"from": "SBC", "to": "PUNE", "date": DATE, "extra_hours": 100, "extra_km": 5000,
                "nearby_km": 80, "min_transfer_min": 600, "limit": 500},
    )
    assert r.status_code == 200
    assert r.json()["params"]["extra_hours"] == 100


def test_no_limit_flags():
    body = client.get(
        "/api/routes",
        params={"from": "SBC", "to": "PUNE", "date": DATE, "no_time_limit": True, "no_km_limit": True, "limit": 1000},
    ).json()
    assert body["params"]["extra_hours"] is None and body["params"]["extra_km"] is None
    assert body["baseline"]["max_minutes"] is None and body["baseline"]["max_km"] is None
    capped = client.get("/api/routes", params={"from": "SBC", "to": "PUNE", "date": DATE, "limit": 1000}).json()
    assert len(body["alternates"]) >= len(capped["alternates"])
    assert max(j["minutes"] for j in body["alternates"]) > capped["baseline"]["max_minutes"]


def test_long_layovers_allowed_when_time_is_unlimited():
    body = client.get(
        "/api/routes",
        params={"from": "SBC", "to": "PUNE", "date": DATE, "no_time_limit": True, "no_km_limit": True, "limit": 500},
    ).json()
    waits = [j["transfer"]["wait_minutes"] for j in body["alternates"] if j["transfer"]]
    assert max(waits) > 12 * 60  # the old hidden 12-hour layover cap is gone


def _trains(j):
    return [leg["train"]["number"] for leg in j["legs"]]


def test_max_changes_is_respected():
    zero = client.get("/api/routes", params={"from": "SBC", "to": "PUNE", "date": DATE, "max_changes": 0}).json()
    assert all(j["changes"] == 0 for j in zero["alternates"])
    two = client.get("/api/routes", params={"from": "SBC", "to": "PUNE", "date": DATE, "max_changes": 2}).json()
    assert all(j["changes"] <= 2 for j in two["alternates"])
    assert any(j["changes"] == 2 for j in two["alternates"])
    for j in two["alternates"]:
        codes = [leg["from"]["code"] for leg in j["legs"]] + [j["legs"][-1]["to"]["code"]]
        assert len(codes) == len(set(codes)), "no station visited twice"
        for t in j["transfers"]:
            assert t["wait_minutes"] >= 20


def test_via_kerala_mangaluru_thane():
    params = {"from": "SBC", "to": "PUNE", "date": DATE, "max_changes": 3, "via": "SRR,MAQ,TNA",
              "no_time_limit": True, "no_km_limit": True}
    body = client.get("/api/routes", params=params).json()
    assert body["alternates"], "expected a route through Shoranur, Mangaluru and Thane"
    for j in body["alternates"]:
        path = []
        for leg in j["legs"]:
            path += [leg["from"]["code"], *(x["code"] for x in leg["passes"])]
        path.append(j["legs"][-1]["to"]["code"])
        assert [c for c in path if c in ("SRR", "MAQ", "TNA")] == ["SRR", "MAQ", "TNA"]
        assert [v["code"] for v in j["via"]] == ["SRR", "MAQ", "TNA"]
        assert j["changes"] <= 3

    limited = client.get("/api/routes", params={k: v for k, v in params.items() if not k.startswith("no_")}).json()
    assert not limited["alternates"] and limited["hidden_by_limits"] > 0


def test_bad_via():
    r = client.get("/api/routes", params={"from": "SBC", "to": "PUNE", "date": DATE, "via": "NOPE"})
    assert r.status_code == 400
