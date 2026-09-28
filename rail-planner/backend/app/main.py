from __future__ import annotations

import os
from contextlib import asynccontextmanager
from datetime import date, datetime
from functools import lru_cache
from pathlib import Path

from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import railradar
from .railradar import LiveError, RailRadar, Usage
from .seats import QUOTAS, safe_check
from .rules import ARP_DAYS, CLASS_LABELS, IST, booking_windows, window_status
from .search import DAY_NAMES, SearchParams, search
from .timetable import StaticTimetable


@asynccontextmanager
async def lifespan(_: FastAPI):
    timetable()  # load once at boot
    live()
    yield


app = FastAPI(title="Rail Planner API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@lru_cache
def timetable() -> StaticTimetable:
    return StaticTimetable()


@lru_cache
def live() -> RailRadar | None:
    """RailRadar client when RAILRADAR_API_KEY is set; the snapshot fills in class info it lacks."""

    def class_hint(number: str) -> tuple[str, ...]:
        t = timetable().train(number)
        return t.classes if t else ()

    return railradar.from_env(class_hint)


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


@app.get("/api/status")
def status() -> dict:
    client = live()
    return {
        "source": "live" if client else "snapshot",
        "provider": "RailRadar" if client else "datameet snapshot (2016-17)",
        "month_requests": client.month_requests() if client else None,
    }


@app.get("/api/stations")
def stations(q: str = Query(..., min_length=1), limit: int = Query(10, le=25)) -> list[dict]:
    return [
        {"code": s.code, "name": s.name, "state": s.state}
        for s in timetable().search_stations(q, limit)
    ]


@app.get("/api/routes")
def routes(
    from_code: str = Query(..., alias="from"),
    to_code: str = Query(..., alias="to"),
    journey_date: date = Query(..., alias="date"),
    extra_hours: float = Query(5.0, ge=0),
    extra_km: float = Query(100.0, ge=0),
    no_time_limit: bool = False,
    no_km_limit: bool = False,
    nearby_km: float = Query(15.0, ge=0),
    min_transfer_min: int = Query(20, ge=0),
    include_unreserved: bool = False,
    limit: int = Query(50, ge=1),
    max_changes: int = Query(2, ge=0),
    min_sleep_hours: float | None = Query(None, ge=0, description="Only routes where one train allows this much sleep, starting 21:00-24:00"),
    via: str = Query("", description="Comma-separated station codes to pass through, in order"),
) -> dict:
    params = SearchParams(
        from_code=from_code.upper(),
        to_code=to_code.upper(),
        journey_date=journey_date,
        extra_hours=None if no_time_limit else extra_hours,
        extra_km=None if no_km_limit else extra_km,
        nearby_km=nearby_km,
        min_transfer_min=min_transfer_min,
        include_unreserved=include_unreserved,
        limit=limit,
        max_changes=max_changes,
        min_sleep_hours=min_sleep_hours,
        via=tuple(c.strip().upper() for c in via.split(",") if c.strip()),
    )
    try:
        return search(timetable(), params, live())
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


def _schedule(number: str, warnings: list[str]) -> dict | None:
    """Train meta plus boardable halts as (code, name, dep_minutes_from_origin_midnight)."""
    if live():
        try:
            t = live().train(number)
            if t:
                m = t["meta"]
                stops = [
                    (r["code"], r["name"], r["dep"] + (r["dep_day"] - 1) * 1440)
                    for r in t["route"]
                    if r["dep"] is not None
                ]
                return {"meta": m, "stops": stops, "source": "live"}
        except LiveError as e:
            warnings.append(f"{e}. Showing the offline snapshot instead.")
    t = timetable().train(number)
    if not t:
        return None
    stops = [(s.code, timetable().station(s.code).name, s.dep) for s in t.stops if s.dep is not None]
    return {"meta": t, "stops": stops, "source": "snapshot"}


@app.get("/api/booking-windows")
def windows(
    journey_date: date = Query(..., alias="date"),
    train: str | None = None,
    board: str | None = Query(None, description="Boarding station code; needed to shift for multi-day trains"),
) -> dict:
    offset, classes, info, depart_at, source, warnings = 0, [], None, None, None, []
    if train:
        sched = _schedule(train.strip(), warnings)
        if not sched:
            raise HTTPException(404, f"Train {train} not found")
        m, stops, source = sched["meta"], sched["stops"], sched["source"]
        stop = stops[0] if stops else None
        if board:
            stop = next((s for s in stops if s[0] == board.upper()), None)
            if stop is None:
                raise HTTPException(400, f"Train {train} does not depart from {board.upper()}")
        if stop is None:
            raise HTTPException(404, f"No schedule for train {train}")
        code, name, dep = stop
        classes = list(m.classes)
        offset = dep // 1440
        depart_at = datetime.combine(journey_date, datetime.min.time(), IST).replace(hour=(dep % 1440) // 60, minute=dep % 60)
        origin_weekday = date.fromordinal(journey_date.toordinal() - offset).weekday()
        info = {
            "number": m.number,
            "name": m.name,
            "board": {"code": code, "name": name},
            "board_day": offset + 1,
            "classes": classes,
            "reserved": m.reserved,
            "runs_on": [DAY_NAMES[d] for d in sorted(m.runs_on)],
            "runs_on_date": origin_weekday in m.runs_on,
        }

    now = datetime.now(IST)
    end_of_day = datetime.combine(journey_date, datetime.max.time(), IST)
    out = []
    for w in booking_windows(journey_date, offset, classes or ["1A", "2A", "3A", "CC", "SL", "2S"]):
        out.append(
            {
                "kind": w.kind,
                "label": w.label,
                "opens_at": w.opens_at.isoformat(),
                "status": window_status(w.opens_at, depart_at or end_of_day, now),
                "classes": w.classes,
                "note": w.note,
            }
        )
    return {
        "journey_date": journey_date.isoformat(),
        "origin_date": date.fromordinal(journey_date.toordinal() - offset).isoformat(),
        "train": info,
        "windows": out,
        "data_source": {"kind": source, "warnings": warnings},
        "rules": {"arp_days": ARP_DAYS, "class_labels": CLASS_LABELS},
    }


class SeatLeg(BaseModel):
    train: str
    from_: str = Field(alias="from")
    to: str
    date: date
    classes: list[str] | None = None
    cls: str | None = None  # per-leg class (Best/Cheapest/Custom pick per train); falls back to the request's cls


class SeatRequest(BaseModel):
    cls: str = "3A"
    quota: str = "GN"
    fresh: bool = False  # bypass the 15-minute cache (the Refresh button)
    legs: list[SeatLeg]


@app.post("/api/seats")
def seats(req: SeatRequest) -> dict:
    """Seat availability per leg. One RailRadar request per uncached (train, segment, class, quota, date)."""
    client = live()
    if not client:
        return {"source": None, "results": [], "message": "Seat availability needs RAILRADAR_API_KEY (live data)."}
    if req.quota not in QUOTAS:
        raise HTTPException(400, f"Unknown quota {req.quota}")
    usage = Usage()
    items = [
        {"train": l.train, "from": l.from_.upper(), "to": l.to.upper(), "date": l.date.isoformat(), "classes": l.classes,
         "cls": (l.cls or req.cls).upper()}
        for l in req.legs
    ]
    with ThreadPoolExecutor(max_workers=2) as pool:  # the client also caps concurrency and backs off on 429
        results = list(pool.map(lambda it: safe_check(client, it, it.pop("cls"), req.quota, usage, req.fresh), items))
    return {
        "source": "live",
        "results": results,
        "requests": usage.requests,
        "cache_hits": usage.cache_hits,
        "month_requests": client.month_requests(),
    }


@app.get("/api/seats")
def seat_one(
    train: str, from_code: str = Query(..., alias="from"), to: str = Query(...), journey_date: date = Query(..., alias="date"),
    cls: str = "3A", quota: str = "GN", fresh: bool = False,
) -> dict:
    """Single-leg seat check (GET), handy for checking one train from a browser or curl."""
    return seats(SeatRequest(cls=cls, quota=quota, fresh=fresh, legs=[SeatLeg(train=train, **{"from": from_code}, to=to, date=journey_date)]))


# Serve the built frontend when present (single-process deploy).
_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if _dist.exists():
    app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        return FileResponse(_dist / "index.html")
