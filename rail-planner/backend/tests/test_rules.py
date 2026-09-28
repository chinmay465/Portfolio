from datetime import date, datetime

from app.rules import IST, booking_windows, origin_date, window_status


def by_kind(ws):
    return {w.kind: w for w in ws}


def test_general_opens_60_days_before_at_8am():
    ws = by_kind(booking_windows(date(2026, 11, 26), 0, ["3A", "SL"]))
    assert ws["general"].opens_at == datetime(2026, 9, 27, 8, 0, tzinfo=IST)


def test_tatkal_ac_and_non_ac_times():
    ws = by_kind(booking_windows(date(2026, 10, 20), 0, ["2A", "3A", "SL"]))
    assert ws["tatkal_ac"].opens_at == datetime(2026, 10, 19, 10, 0, tzinfo=IST)
    assert ws["tatkal_non_ac"].opens_at == datetime(2026, 10, 19, 11, 0, tzinfo=IST)
    assert ws["tatkal_ac"].classes == ["2A", "3A"]
    assert ws["tatkal_non_ac"].classes == ["SL"]


def test_windows_follow_origin_date_for_multi_day_trains():
    # Boarding on the train's 2nd day: everything shifts one day earlier.
    assert origin_date(date(2026, 10, 20), 1) == date(2026, 10, 19)
    ws = by_kind(booking_windows(date(2026, 10, 20), 1, ["3A"]))
    assert ws["general"].opens_at.date() == date(2026, 8, 20)
    assert ws["tatkal_ac"].opens_at.date() == date(2026, 10, 18)


def test_no_tatkal_for_first_ac_only_train():
    ws = by_kind(booking_windows(date(2026, 10, 20), 0, ["1A"]))
    assert set(ws) == {"general"}


def test_ac_only_train_has_no_non_ac_tatkal():
    ws = by_kind(booking_windows(date(2026, 10, 20), 0, ["1A", "2A", "3A"]))
    assert "tatkal_non_ac" not in ws


def test_status():
    opens = datetime(2026, 10, 19, 10, 0, tzinfo=IST)
    departs = datetime(2026, 10, 20, 16, 0, tzinfo=IST)
    assert window_status(opens, departs, datetime(2026, 10, 19, 9, 59, tzinfo=IST)) == "upcoming"
    assert window_status(opens, departs, datetime(2026, 10, 19, 10, 0, tzinfo=IST)) == "open"
    assert window_status(opens, departs, datetime(2026, 10, 20, 16, 0, tzinfo=IST)) == "departed"
