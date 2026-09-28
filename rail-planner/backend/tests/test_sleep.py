from datetime import date, datetime, timedelta

from fastapi.testclient import TestClient

from app.main import app
from app.rules import IST
from app.sleep import sleep_block


class _T:
    number = "1"


class _Leg:
    def __init__(self, dep: str, arr: str):
        self.depart_at = datetime.fromisoformat(dep).replace(tzinfo=IST)
        self.arrive_at = datetime.fromisoformat(arr).replace(tzinfo=IST)
        self.train = _T()


def block(dep, arr, hours):
    b = sleep_block([_Leg(dep, arr)], hours)
    return b and (b["start"].strftime("%d %H:%M"), b["end"].strftime("%d %H:%M"))


def test_starts_at_9pm_when_train_leaves_earlier():
    # leave 18:00, 8 h sleep -> 21:00-05:00; arriving 05:00 is enough, 04:59 isn't
    assert block("2026-10-20T18:00", "2026-10-21T05:00", 8) == ("20 21:00", "21 05:00")
    assert block("2026-10-20T18:00", "2026-10-21T04:59", 8) is None


def test_starts_at_departure_inside_the_window():
    # the user's example: 10 h from a 22:30 departure -> 22:30-08:30
    assert block("2026-10-20T22:30", "2026-10-21T09:00", 10) == ("20 22:30", "21 08:30")
    assert block("2026-10-20T22:30", "2026-10-21T08:00", 10) is None


def test_departure_after_midnight_is_outside_the_window():
    assert block("2026-10-21T00:30", "2026-10-21T12:00", 8) is None
    assert block("2026-10-21T00:00", "2026-10-21T12:00", 8) == ("21 00:00", "21 08:00")  # exactly midnight is ok


def test_day_train_gives_no_sleep_and_second_night_counts():
    assert block("2026-10-20T06:00", "2026-10-20T20:00", 1) is None
    # leaves 06:00, runs two nights: first night qualifies
    assert block("2026-10-20T06:00", "2026-10-22T08:00", 8) == ("20 21:00", "21 05:00")


def test_change_of_train_interrupts_sleep():
    legs = [_Leg("2026-10-20T20:00", "2026-10-21T01:00"), _Leg("2026-10-21T01:30", "2026-10-21T09:00")]
    assert sleep_block(legs, 8) is None


def test_api_filters_routes_by_sleep():
    c = TestClient(app)
    base = {"from": "SBC", "to": "PUNE", "date": "2026-10-20", "max_changes": 1, "limit": 500}
    all_ = c.get("/api/routes", params=base).json()
    slept = c.get("/api/routes", params={**base, "min_sleep_hours": 8}).json()
    assert slept["params"]["min_sleep_hours"] == 8
    n_all = len(all_["direct"]) + len(all_["alternates"])
    n_slept = len(slept["direct"]) + len(slept["alternates"])
    assert 0 < n_slept < n_all and slept["hidden_by_sleep"] > 0
    for j in slept["direct"] + slept["alternates"]:
        s = j["sleep"]
        start, end = datetime.fromisoformat(s["start"]), datetime.fromisoformat(s["end"])
        leg = j["legs"][s["leg"]]
        assert 21 <= start.hour or start.strftime("%H:%M") == "00:00"
        assert end - start == timedelta(hours=8)
        assert datetime.fromisoformat(leg["depart_at"]) <= start and datetime.fromisoformat(leg["arrive_at"]) >= end
