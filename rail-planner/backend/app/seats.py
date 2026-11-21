"""Seat availability: fetch per leg and classify IRCTC-style status strings.

Status strings seen from RailRadar / IRCTC:
    AVAILABLE-0045, AVL 12, CURR_AVBL-0010      -> available (count)
    RAC 8, RAC8, RAC/RAC 5                       -> rac (count)
    WL#35, GNWL24/WL11, PQWL5/WL3, RLWL 4, TQWL  -> waitlist (current position)
    REGRET/WL, REGRET, NOT AVAILABLE             -> regret (not bookable)
    TRAIN DEPARTED, TRAIN CANCELLED, ...         -> closed
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime

from .railradar import LiveError, RailRadar, Usage
from .rules import IST

CATEGORIES = ("available", "rac", "waitlist", "regret", "closed", "no_class", "unknown")
# If a train doesn't carry the chosen class, check the closest one it does have (AC stays AC first).
FALLBACK = {
    "1A": ["2A", "EC", "3A"], "2A": ["3A", "1A", "CC", "EC", "3E"], "3A": ["3E", "2A", "CC", "SL", "2S"],
    "3E": ["3A", "SL", "CC", "2S"], "SL": ["2S", "3E", "3A", "CC"], "CC": ["EC", "2S", "3A", "SL"],
    "EC": ["CC", "1A", "2A"], "2S": ["SL", "CC", "3E"],
}
QUOTAS = {"GN": "General", "TQ": "Tatkal", "PT": "Premium Tatkal", "LD": "Ladies", "SS": "Senior citizen"}


@dataclass
class SeatStatus:
    category: str
    count: int | None
    label: str
    raw: str
    prediction: str | None = None
    prediction_pct: float | None = None


def classify(raw: str | None) -> SeatStatus:
    s = (raw or "").strip().upper()
    if not s:
        return SeatStatus("unknown", None, "Unknown", raw or "")
    num = lambda pat: int(m.group(1)) if (m := re.search(pat, s)) else None  # noqa: E731

    if "DEPARTED" in s or "CANCEL" in s or "CHART PREPARED" in s or "BOOKING NOT ALLOWED" in s or "CLOSED" in s:
        return SeatStatus("closed", None, s.title(), raw)
    if "REGRET" in s or s in ("NOT AVAILABLE", "N.A.", "NA", "NOT_AVAILABLE"):
        return SeatStatus("regret", None, "Regret (no seats)", raw)
    if s.startswith("AVAILABLE") or s.startswith("AVL") or "CURR_AVBL" in s or s.startswith("CURR AVBL"):
        n = num(r"(\d+)")
        return SeatStatus("available", n, f"Available {n}" if n is not None else "Available", raw)
    if s.startswith("RAC"):
        n = num(r"RAC\D*(\d+)")
        return SeatStatus("rac", n, f"RAC {n}" if n is not None else "RAC", raw)
    if "WL" in s:
        # "GNWL24/WL11": booking position 24, current 11 -> current position is what matters
        n = num(r"/\s*WL\D*(\d+)") or num(r"WL\D*(\d+)")
        return SeatStatus("waitlist", n, f"Waitlist {n}" if n is not None else "Waitlist", raw)
    return SeatStatus("unknown", None, s.title(), raw)


def _row_date(row: dict) -> date | None:
    for key in ("availablityDate", "availabilityDate", "date", "journeyDate"):
        v = row.get(key)
        if not v:
            continue
        for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d-%m-%y", "%d/%m/%Y"):
            try:
                return datetime.strptime(str(v)[:10], fmt).date()
            except ValueError:
                continue
    return None


def _row_status(row: dict) -> str | None:
    for key in ("availablityStatus", "availabilityStatus", "currentStatus", "status"):
        if row.get(key):
            return str(row[key])
    return None


def check_leg(
    live: RailRadar, number: str, source: str, destination: str, day: date, cls: str, quota: str,
    classes: list[str] | None = None, usage: Usage | None = None, fresh: bool = False,
) -> dict:
    """Availability for one leg on its boarding date. Never guesses: unknown stays unknown."""
    base = {"train": number, "from": source, "to": destination, "date": day.isoformat(), "cls": cls, "quota": quota}
    use = cls
    if classes and cls not in classes:
        use = next((c for c in FALLBACK.get(cls, []) if c in classes), None)
        if use is None:
            st = SeatStatus("no_class", None, f"No {cls} on this train", "")
            return {**base, **st.__dict__, "checked_cls": None, "checked_at": None}
    base["checked_cls"] = use
    res = live.seats(number, source, destination, day.isoformat(), use, quota, usage, fresh)
    row = next((r for r in res["rows"] if _row_date(r) == day), None)
    if row is None and len(res["rows"]) == 1 and _row_date(res["rows"][0]) is None:
        row = res["rows"][0]
    st = classify(_row_status(row) if row else None)
    if row:
        st.prediction = row.get("prediction")
        pct = row.get("predictionPercentage")
        st.prediction_pct = float(pct) if isinstance(pct, (int, float, str)) and str(pct).replace(".", "", 1).isdigit() else None
    checked = res["fetched_at"]
    return {
        **base,
        **st.__dict__,
        "checked_at": datetime.fromtimestamp(checked, IST).isoformat() if checked else None,
    }


def safe_check(live: RailRadar, item: dict, cls: str, quota: str, usage: Usage, fresh: bool = False) -> dict:
    try:
        return check_leg(
            live, item["train"], item["from"], item["to"], date.fromisoformat(item["date"]), cls, quota,
            item.get("classes"), usage, fresh,
        )
    except LiveError as e:
        return {**item, "cls": cls, "quota": quota, "checked_cls": None, "category": "unknown", "count": None, "label": "Couldn't check",
                "raw": "", "error": str(e), "prediction": None, "prediction_pct": None, "checked_at": None}
