"""RailRadar client: current train times, running days and distances.

Docs: https://railradar.in/docs  (auth: `Authorization: Bearer rr_live_...`)

Responses are cached in SQLite. Timetables change rarely, so the default TTL is 7 days and
running days are filtered locally, so one cached (from, to) pair serves every travel date.
Set RAILRADAR_CACHE to a path on a persistent disk to keep the cache across restarts.
"""

from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

import httpx

from .rules import IST

BASE_URL = os.getenv("RAILRADAR_BASE_URL", "https://api.railradar.in/v1")
DEFAULT_CACHE = Path(__file__).resolve().parent.parent / "data" / "railradar-cache.sqlite3"
SEATS_TTL = int(os.getenv("SEATS_TTL", "900"))
CONCURRENCY = int(os.getenv("RAILRADAR_CONCURRENCY", "2"))
MAX_RETRIES = 3
BACKOFF = float(os.getenv("RAILRADAR_BACKOFF", "1"))  # seconds; doubles each retry
DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

# RailRadar coach position codes -> class codes (H1 = First AC, A1 = 2A, B1 = 3A, ...)
COACH_PREFIX = {"H": "1A", "A": "2A", "B": "3A", "M": "3E", "G": "3E", "S": "SL", "C": "CC", "E": "EC", "D": "2S"}
UNRESERVED_TYPES = ("passenger", "memu", "demu", "emu", "suburban", "local")


class LiveError(Exception):
    """The live source could not answer (bad key, quota, network)."""


@dataclass(frozen=True)
class TrainMeta:
    number: str
    name: str
    type: str
    classes: tuple[str, ...]
    runs_on: frozenset[int]
    reserved: bool


@dataclass(frozen=True)
class LegOption:
    """One train between two stations, independent of date.

    dep / arr are minutes from 00:00 of the day the train leaves its origin.
    """

    train: TrainMeta
    from_code: str
    to_code: str
    dep: int
    arr: int
    km: int


@dataclass(frozen=True)
class BoardStop:
    """A train's halt at one station, from the station board. Times are minutes from origin-day 00:00."""

    train: TrainMeta
    code: str
    sequence: int
    arr: int | None
    dep: int | None
    km: float


def legs_from_boards(a: dict[str, BoardStop], b: dict[str, BoardStop]) -> list[LegOption]:
    """Trains that call at station a and later at station b."""
    out = []
    for number in a.keys() & b.keys():
        s, e = a[number], b[number]
        if s.dep is None or e.arr is None:
            continue
        later = e.sequence > s.sequence if s.sequence and e.sequence else e.km > s.km
        if not later or e.arr <= s.dep:
            continue
        out.append(LegOption(s.train, s.code, e.code, s.dep, e.arr, round(e.km - s.km)))
    return out


@dataclass
class Usage:
    requests: int = 0
    cache_hits: int = 0
    errors: list[str] = field(default_factory=list)


def _error_message(res: httpx.Response) -> str:
    """RailRadar's own error text, wherever it put it."""
    try:
        body = res.json()
    except ValueError:
        return (res.text or res.reason_phrase or "").strip()[:200]
    if isinstance(body, dict):
        for v in (
            (body.get("meta") or {}).get("message") if isinstance(body.get("meta"), dict) else None,
            body.get("message"),
            (body.get("error") or {}).get("message") if isinstance(body.get("error"), dict) else body.get("error"),
            body.get("detail"),
        ):
            if v:
                return str(v)[:200]
    return res.reason_phrase or f"HTTP {res.status_code}"


def _hhmm(value: str | None) -> int | None:
    if not value:
        return None
    h, m = value.split(":")[:2]
    return int(h) * 60 + int(m)


def _runs_on(days: list[str] | None) -> frozenset[int]:
    if not days:
        return frozenset(range(7))
    return frozenset(DAYS.index(d.lower()[:3]) for d in days if d.lower()[:3] in DAYS)


def classes_from_coaches(position: str | None) -> tuple[str, ...]:
    if not position:
        return ()
    found = []
    for coach in position.split("-"):
        c = COACH_PREFIX.get(coach[:1].upper()) if coach[1:2].isdigit() else None
        if c and c not in found:
            found.append(c)
    order = ["1A", "2A", "3A", "3E", "EC", "CC", "SL", "2S"]
    return tuple(sorted(found, key=order.index))


class RailRadar:
    def __init__(
        self,
        api_key: str,
        cache_path: Path | str | None = None,
        ttl_seconds: int = 7 * 86400,
        client: httpx.Client | None = None,
        class_hint=None,
    ) -> None:
        self._client = client or httpx.Client(
            base_url=BASE_URL,
            headers={"Authorization": f"Bearer {api_key}", "Accept": "application/json"},
            timeout=15,
        )
        self._ttl = ttl_seconds
        self._class_hint = class_hint or (lambda number: ())
        path = Path(cache_path or os.getenv("RAILRADAR_CACHE") or DEFAULT_CACHE)
        path.parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(path, check_same_thread=False)
        self._db.execute("CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, body TEXT, fetched REAL)")
        self._db.execute("CREATE TABLE IF NOT EXISTS usage (month TEXT PRIMARY KEY, requests INTEGER)")
        self._lock = threading.Lock()
        self._slots = threading.BoundedSemaphore(CONCURRENCY)
        self._next_ok = 0.0  # monotonic time before which no call may start (shared cool-down after 429)
        self._quota_month: str | None = None
        self._quota_msg = ""

    # ---- raw access with cache ----

    def _get(self, path: str, usage: Usage | None = None, params: dict | None = None, ttl: int | None = None) -> dict:
        key = path + ("?" + "&".join(f"{k}={v}" for k, v in sorted(params.items())) if params else "")
        with self._lock:
            row = self._db.execute("SELECT body, fetched FROM cache WHERE key = ?", (key,)).fetchone()
        if row and time.time() - row[1] < (self._ttl if ttl is None else ttl):
            if usage:
                usage.cache_hits += 1
            return json.loads(row[0])

        res = self._fetch(path, params, usage)
        if res.status_code == 404:
            body = {"success": False, "data": None}
        else:
            body = res.json()
        with self._lock:
            self._db.execute("INSERT OR REPLACE INTO cache VALUES (?, ?, ?)", (key, json.dumps(body), time.time()))
            self._db.commit()
        return body

    def _fetch(self, path: str, params: dict | None, usage: Usage | None) -> httpx.Response:
        """One upstream call, with a shared cool-down after 429s and a small concurrency cap.

        RailRadar answers 429 both for per-second rate limits and for an exhausted monthly quota.
        Rate limits are retried after Retry-After (or 1 -> 2 -> 4 s); a quota message stops all
        further calls until the next month so retries don't burn what's left.
        """
        month = datetime.now(IST).strftime("%Y-%m")
        if self._quota_month == month:
            raise LiveError(f"RailRadar monthly quota used up: {self._quota_msg}")
        for attempt in range(MAX_RETRIES + 1):
            with self._slots:
                wait = self._next_ok - time.monotonic()
                if wait > 0:
                    time.sleep(wait)
                try:
                    res = self._client.get(path, params=params)
                except httpx.HTTPError as e:
                    raise LiveError(f"RailRadar unreachable: {e.__class__.__name__}") from e
            self._count()
            if usage:
                usage.requests += 1
            if res.status_code != 429:
                break
            msg = _error_message(res)
            if any(w in msg.lower() for w in ("month", "quota", "plan limit", "upgrade")):
                self._quota_month, self._quota_msg = month, msg
                raise LiveError(f"RailRadar monthly quota used up: {msg}")
            retry_after = res.headers.get("retry-after")
            delay = float(retry_after) if retry_after and retry_after.replace(".", "", 1).isdigit() else BACKOFF * 2**attempt
            self._next_ok = max(self._next_ok, time.monotonic() + min(delay, 10))
        else:
            raise LiveError(f"RailRadar rate limit (HTTP 429): {_error_message(res)}")

        if res.status_code in (401, 403):
            raise LiveError(f"RailRadar refused the request (HTTP {res.status_code}): {_error_message(res)}")
        if res.status_code >= 400 and res.status_code != 404:
            raise LiveError(f"RailRadar error (HTTP {res.status_code}): {_error_message(res)}")
        return res

    def _count(self) -> None:
        month = datetime.now(IST).strftime("%Y-%m")
        with self._lock:
            self._db.execute(
                "INSERT INTO usage VALUES (?, 1) ON CONFLICT(month) DO UPDATE SET requests = requests + 1", (month,)
            )
            self._db.commit()

    def month_requests(self) -> int:
        month = datetime.now(IST).strftime("%Y-%m")
        with self._lock:
            row = self._db.execute("SELECT requests FROM usage WHERE month = ?", (month,)).fetchone()
        return row[0] if row else 0

    # ---- typed helpers ----

    def station_board(self, code: str, usage: Usage | None = None) -> dict[str, "BoardStop"]:
        """Every train that halts at a station, keyed by train number."""
        body = self._get(f"/stations/{code}/trains", usage)
        data = body.get("data") or {}
        out: dict[str, BoardStop] = {}
        for item in data.get("trains") or []:
            t, st = item.get("train") or {}, item.get("stop") or {}
            if not t.get("number"):
                continue
            arr, dep = _hhmm(st.get("arrival")), _hhmm(st.get("departure"))
            out[str(t["number"])] = BoardStop(
                train=self._meta(t),
                code=code.upper(),
                sequence=int(st.get("sequence") or 0),
                arr=None if arr is None else arr + (int(st.get("arrivalDay") or 1) - 1) * 1440,
                dep=None if dep is None else dep + (int(st.get("departureDay") or 1) - 1) * 1440,
                km=float(st.get("distance") or 0),
            )
        return out

    def legs_between(self, a: str, b: str, usage: Usage | None = None) -> list[LegOption]:
        return legs_from_boards(self.station_board(a, usage), self.station_board(b, usage))

    def seats(
        self, number: str, source: str, destination: str, journey_date: str, cls: str, quota: str = "GN",
        usage: Usage | None = None, fresh: bool = False,
    ) -> dict:
        """Seat availability for one train/segment/class/quota: a rolling window of dates from journey_date.

        Request/response shape follows RailRadar's /trains/{number}/seats (fields are spelled
        "availablity..." by the API). Cached for SEATS_TTL seconds (default 15 min): seats move fast.
        """
        body = self._get(
            f"/trains/{number}/seats",
            usage,
            {"source": source, "destination": destination, "journeyDate": journey_date, "classCode": cls, "quotaCode": quota},
            ttl=0 if fresh else SEATS_TTL,
        )
        data = body.get("data") or {}
        rows = data.get("availability") if isinstance(data, dict) else data
        return {"rows": rows or [], "fetched_at": self.fetched_at(number, source, destination, journey_date, cls, quota)}

    def fetched_at(self, number, source, destination, journey_date, cls, quota) -> float | None:
        params = {"source": source, "destination": destination, "journeyDate": journey_date, "classCode": cls, "quotaCode": quota}
        key = f"/trains/{number}/seats?" + "&".join(f"{k}={v}" for k, v in sorted(params.items()))
        with self._lock:
            row = self._db.execute("SELECT fetched FROM cache WHERE key = ?", (key,)).fetchone()
        return row[0] if row else None

    def train(self, number: str, usage: Usage | None = None) -> dict | None:
        """Full schedule: {"meta": TrainMeta, "route": [{code, name, arr, dep, day_arr, day_dep, km}]}."""
        body = self._get(f"/trains/{number}", usage, {"haltsOnly": "true"})
        data = body.get("data")
        if not data:
            return None
        t = data.get("train") or {}
        route = []
        for r in data.get("route") or []:
            st = r.get("station") or {}
            route.append(
                {
                    "code": (st.get("code") or "").upper(),
                    "name": st.get("name") or st.get("code"),
                    "arr": _hhmm(r.get("arrival")),
                    "dep": _hhmm(r.get("departure")),
                    "arr_day": int(r.get("arrivalDay") or 1),
                    "dep_day": int(r.get("departureDay") or 1),
                    "km": round(float(r.get("distance") or 0)),
                }
            )
        meta = self._meta(t, classes_from_coaches(t.get("coachPosition")))
        return {"meta": meta, "route": route}

    def _meta(self, t: dict, classes: tuple[str, ...] = ()) -> TrainMeta:
        number = str(t.get("number"))
        ttype = t.get("type") or t.get("category") or ""
        reserved = not any(k in ttype.lower() for k in UNRESERVED_TYPES)
        return TrainMeta(
            number=number,
            name=t.get("name") or number,
            type=ttype,
            classes=classes or tuple(self._class_hint(number)),
            runs_on=_runs_on(t.get("runDays")),
            reserved=reserved,
        )


def from_env(class_hint=None) -> RailRadar | None:
    key = os.getenv("RAILRADAR_API_KEY", "").strip()
    if not key:
        return None
    return RailRadar(key, class_hint=class_hint)
