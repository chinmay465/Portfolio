from __future__ import annotations

import os
from contextlib import asynccontextmanager
from datetime import date, datetime
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .rules import ARP_DAYS, CLASS_LABELS, IST, booking_windows, window_status
from .search import SearchParams, search
from .timetable import StaticTimetable

@asynccontextmanager
async def lifespan(_: FastAPI):
    timetable()  # load once at boot
    yield


app = FastAPI(title="Rail Planner API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_methods=["GET"],
    allow_headers=["*"],
)


@lru_cache
def timetable() -> StaticTimetable:
    return StaticTimetable()


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


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
    extra_hours: float = Query(3.0, ge=0, le=24),
    extra_km: float = Query(150.0, ge=0, le=1000),
    nearby_km: float = Query(15.0, ge=0, le=50),
    min_transfer_min: int = Query(45, ge=15, le=240),
    include_unreserved: bool = False,
    limit: int = Query(25, ge=1, le=60),
) -> dict:
    params = SearchParams(
        from_code=from_code.upper(),
        to_code=to_code.upper(),
        journey_date=journey_date,
        extra_hours=extra_hours,
        extra_km=extra_km,
        nearby_km=nearby_km,
        min_transfer_min=min_transfer_min,
        include_unreserved=include_unreserved,
        limit=limit,
    )
    try:
        return search(timetable(), params)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@app.get("/api/booking-windows")
def windows(
    journey_date: date = Query(..., alias="date"),
    train: str | None = None,
    board: str | None = Query(None, description="Boarding station code; needed to shift for multi-day trains"),
) -> dict:
    offset, classes, info, depart_at = 0, [], None, None
    if train:
        t = timetable().train(train)
        if not t:
            raise HTTPException(404, f"Train {train} not found")
        classes = list(t.classes)
        idx = 0
        if board:
            idx = next((i for i, s in enumerate(t.stops) if s.code == board.upper() and s.dep is not None), None)
            if idx is None:
                raise HTTPException(400, f"Train {train} does not depart from {board.upper()}")
        stop = t.stops[idx]
        offset = stop.dep // 1440
        depart_at = datetime.combine(journey_date, datetime.min.time(), IST).replace(
            hour=(stop.dep % 1440) // 60, minute=stop.dep % 60
        )
        info = {
            "number": t.number,
            "name": t.name,
            "board": {"code": stop.code, "name": timetable().station(stop.code).name},
            "board_day": offset + 1,
            "classes": classes,
            "reserved": t.reserved,
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
        "rules": {"arp_days": ARP_DAYS, "class_labels": CLASS_LABELS},
    }


# Serve the built frontend when present (single-process deploy).
_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if _dist.exists():
    app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        return FileResponse(_dist / "index.html")
