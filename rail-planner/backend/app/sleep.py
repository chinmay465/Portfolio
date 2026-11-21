"""Minimum sleep on board.

A route qualifies when one of its trains has you on board continuously for `hours`, with
sleep starting between 21:00 and 24:00 on some night:

    start = max(train departs, 21:00 that night)   # must be <= 24:00 that night
    end   = start + hours                          # train must still be running (arrival >= end)

A change of trains interrupts sleep, so the block has to fit inside a single leg.
Example: leave 22:30, want 10 h -> asleep 22:30-08:30, so the train must arrive at 08:30 or later.
"""

from __future__ import annotations

from datetime import datetime, time, timedelta

from .rules import IST

WINDOW_START = time(21, 0)
WINDOW_HOURS = 3  # 21:00 -> 24:00


def sleep_block(legs: list, hours: float) -> dict | None:
    """First (leg, start, end) that gives `hours` of uninterrupted sleep, else None."""
    need = timedelta(hours=hours)
    for i, leg in enumerate(legs):
        dep, arr = leg.depart_at, leg.arrive_at
        night = dep.date() - timedelta(days=1)  # a train leaving 00:10 can still be inside last night's window
        while True:
            w_start = datetime.combine(night, WINDOW_START, IST)
            if w_start >= arr:
                break
            w_end = w_start + timedelta(hours=WINDOW_HOURS)
            start = max(dep, w_start)
            if start <= w_end and arr - start >= need:
                return {"leg": i, "train": leg.train.number, "start": start, "end": start + need}
            night += timedelta(days=1)
    return None


def best_sleep(legs: list) -> timedelta:
    """Longest possible sleep (starting 21:00-24:00) on any single leg; used for display."""
    best = timedelta(0)
    for leg in legs:
        dep, arr = leg.depart_at, leg.arrive_at
        night = dep.date() - timedelta(days=1)
        while True:
            w_start = datetime.combine(night, WINDOW_START, IST)
            if w_start >= arr:
                break
            start = max(dep, w_start)
            if start <= w_start + timedelta(hours=WINDOW_HOURS):
                best = max(best, arr - start)
            night += timedelta(days=1)
    return best
