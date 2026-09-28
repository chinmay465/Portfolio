"""IRCTC booking-window rules (as of September 2026).

All windows are computed from the date the train leaves its ORIGIN station, not the
passenger's boarding station. A train that reaches your station on its 2nd day has
its windows open one day earlier than a naive "journey date minus N" calculation.

Rules encoded here:
- General (ARP): opens 60 days before the origin date (journey date excluded), 08:00 IST.
  On opening day, online booking is limited to Aadhaar-authenticated users until midnight
  (phased in Oct 2025 -> Jan 2026).
- Tatkal / Premium Tatkal: open 1 day before the origin date, 10:00 IST for AC classes and
  11:00 IST for non-AC classes. Aadhaar OTP authentication is mandatory, and authorised
  agents are blocked for the first 30 minutes. Not offered in 1A.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")

ARP_DAYS = 60
GENERAL_OPEN = time(8, 0)
TATKAL_AC_OPEN = time(10, 0)
TATKAL_NON_AC_OPEN = time(11, 0)
AGENT_BLOCK_MINUTES = 30

AC_CLASSES = {"1A", "2A", "3A", "3E", "CC", "EC"}
NON_AC_CLASSES = {"SL", "2S", "FC"}
TATKAL_EXCLUDED = {"1A"}

CLASS_LABELS = {
    "1A": "First AC",
    "2A": "AC 2 Tier",
    "3A": "AC 3 Tier",
    "3E": "AC 3 Economy",
    "CC": "AC Chair Car",
    "EC": "Executive Chair Car",
    "SL": "Sleeper",
    "2S": "Second Sitting",
    "FC": "First Class",
}


@dataclass(frozen=True)
class Window:
    kind: str  # "general" | "tatkal_ac" | "tatkal_non_ac"
    label: str
    opens_at: datetime
    classes: list[str]
    note: str


def origin_date(journey_date: date, boarding_day_offset: int) -> date:
    """Date the train leaves its origin, given the passenger's boarding date.

    boarding_day_offset is 0 when the train departs the boarding station on its first day,
    1 on its second day, and so on.
    """
    return journey_date - timedelta(days=boarding_day_offset)


def booking_windows(journey_date: date, boarding_day_offset: int, classes: list[str]) -> list[Window]:
    start = origin_date(journey_date, boarding_day_offset)
    general_day = start - timedelta(days=ARP_DAYS)
    tatkal_day = start - timedelta(days=1)

    if classes:
        known = classes
        ac = [c for c in known if c in AC_CLASSES and c not in TATKAL_EXCLUDED]
        non_ac = [c for c in known if c in NON_AC_CLASSES]
    else:  # coach composition unknown: show both Tatkal slots without guessing classes
        known, ac, non_ac = ["All classes"], ["AC classes"], ["Non-AC classes"]

    windows = [
        Window(
            kind="general",
            label="General booking",
            opens_at=datetime.combine(general_day, GENERAL_OPEN, IST),
            classes=known,
            note="Online booking on opening day is limited to Aadhaar-authenticated IRCTC users until midnight.",
        )
    ]
    if ac:
        windows.append(
            Window(
                kind="tatkal_ac",
                label="Tatkal · AC",
                opens_at=datetime.combine(tatkal_day, TATKAL_AC_OPEN, IST),
                classes=ac,
                note=f"Aadhaar OTP required. Agents blocked until 10:{AGENT_BLOCK_MINUTES:02d}. Premium Tatkal opens at the same time.",
            )
        )
    if non_ac:
        windows.append(
            Window(
                kind="tatkal_non_ac",
                label="Tatkal · Non-AC",
                opens_at=datetime.combine(tatkal_day, TATKAL_NON_AC_OPEN, IST),
                classes=non_ac,
                note=f"Aadhaar OTP required. Agents blocked until 11:{AGENT_BLOCK_MINUTES:02d}. Premium Tatkal opens at the same time.",
            )
        )
    return windows


def window_status(opens_at: datetime, departs_at: datetime, now: datetime) -> str:
    if now >= departs_at:
        return "departed"
    if now >= opens_at:
        return "open"
    return "upcoming"
