# Rail Planner

**Live:** https://rail-planner-08hw.onrender.com (free tier, so the first load after a pause takes about 30 s)

Booking-window calculator and alternate-route finder for Indian Railways.
Backend: Python (FastAPI). Frontend: React + TypeScript (Vite).

## Features

**Booking windows** (general and Tatkal), for every leg of every result, plus a standalone calendar tab.
- General: 60 days before the train leaves its **origin**, 08:00 IST. On opening day only Aadhaar-verified users can book online until midnight.
- Tatkal / Premium Tatkal: 1 day before the origin date, 10:00 (AC) and 11:00 (non-AC). Aadhaar OTP is required, agents are blocked for the first 30 min, and 1A is excluded.
- Multi-day trains are handled. If you board on the train's 2nd day, the windows open a day earlier.
- "Remind me" downloads an `.ics` event with a 10-minute alarm.

**Alternate routes**, compared against the fastest and shortest direct train:

| Input | Default | Meaning |
|---|---|---|
| Extra travel time | 5 h | max time over the fastest direct train; any value, or **No limit** |
| Extra distance | 100 km | max rail km over the shortest direct train; any value, or **No limit** |
| Max changes | 2 | any number; 0 = direct trains only |
| Via stations | none | stations the route must pass through, in order (changing there or staying on the train). Each can have a planned **stop** in hours (e.g. Udupi 7 h): you get off there, the next train leaves at least that long after you arrive, and the stop doesn't count against the extra-time limit |
| Trains | any | only routes that use at least one of the picked trains. Pick them in Filters (search by number or name), or press **Only this train** on any train in the results. The pinned train's stops are added as change points, so routes built around it are found. If none fit your limits, the page says how many exist beyond them |
| Via buffer (± km) | 0 | per via station: any station within this distance also counts as that via stop (e.g. Madgaon ± 30 km covers Karmali, Vasco, Margao…). A planned stop applies to whichever one the route uses. With via stations set, direct trains that skip them aren't listed |
| Leave no earlier than / Reach by | any | time window: first train leaves at or after `depart_after` (HH:MM on the journey date) and you arrive by `arrive_by` (date + time). The multi-change search prunes to the window while building routes |
| Maximum wait at a station | no limit | longest wait between trains at any change, counted on top of a planned stop (Udupi 7 h + max wait 2 h = next train 7–9 h after arrival) |
| Minimum sleep | off (8 h when on) | one train must let you sleep this long, starting 21:00–24:00 (at 21:00, or at departure if later) |
| Nearby stations within | 15 km | also board or alight at busy stations nearby (e.g. YPR/BNC/KJM for SBC); any value |
| Minimum change time | 20 min | for one-change routes; any value. Changes under 45 min are flagged "Tight change" |

Routes with 2 or more changes, or with via stations, come from a round-by-round search (one train per round) over the useful stations: both ends, nearby stations, the best-connected change points, and your via stations. It keeps the earliest few partial routes per station each round and prunes anything that can't meet your limits. If via stations are set but nothing fits your limits, the results say how many routes exist beyond them and how long the fastest takes, with a one-click "Remove limits". With live data, 2+ changes adds up to 16 more station timetables (cached and shared), about 30 requests for a brand-new route.

Filters are hidden behind **+ Add filters** and edited as a draft. Nothing is searched until you press **Apply** (or **Find trains**). Every number field accepts 0 (Max changes 0 = direct trains only).

**Sorting and tabs are server-side.** `GET /api/routes` takes `sort` (`duration`, `departure`, `arrival`, `distance`, `changes`), `order` (`asc`/`desc`) and `kind` (`all`, `direct`, `nearby`, `connection`). The server sorts and filters *every* route found, then returns the first `limit` as `results`, with `counts` per tab and `total` for paging. The page never re-sorts.

There are no built-in upper bounds, and no hidden layover cap: the wait between trains is limited only by your total-time setting. Results come back 50 at a time, fastest first, and "Show more alternates" loads the next 50.

Alternates are either a direct train from or to a nearby station, or a two-train route with one change. If no direct train exists, the best alternate becomes the baseline. When you change the inputs, results refresh automatically. The last trip, recent trips and your tolerance settings are saved in the browser.

**Seat availability** (live data only), from RailRadar's `GET /v1/trains/{number}/seats?source=&destination=&journeyDate=&classCode=&quotaCode=`
- **Seat class** above the results: **Best possible** picks the highest class each train carries, **Cheapest** the lowest (fare order 2S < SL < 3E < CC < 3A < 2A < EC < 1A). A route can end up with 2S on one train and SL on another. **Custom** gives each train a class dropdown. Changing any train's class switches the toggle to Custom and keeps the other picks. With minimum sleep on, the train you sleep on only uses berth classes. Class lists come from the stored timetable, so they can be incomplete.
- Choose a quota (General, Tatkal, Premium Tatkal, Ladies, Senior citizen). Each reserved leg shows AVL / RAC / WL (with confirmation %) / REGRET.
- If a train doesn't have your class, the closest class it does have is checked and labelled (e.g. 3A chosen, Hutatma has only CC → "WL 11 · CC").
- **Hide routes with waitlist / no seats** removes a route when any leg is waitlisted, regret, closed or missing the class. **Count RAC as available** is optional. Unchecked routes stay visible and are marked.
- Cost control: each leg is one API request, cached for 15 minutes (`SEATS_TTL`). Only the first N routes are checked automatically (default 10, set to 0 to turn off). If the filter hides some, the next ones are checked, up to 3×N per search. Other routes have a "Check seats" button, and "Refresh" skips the cache.
- Rate limits: RailRadar answers HTTP 429 both for per-second limits and for the monthly quota. After a rate-limit 429 the client pauses every call (honouring `Retry-After`, otherwise 1 → 2 → 4 s) and retries up to 3 times. It runs at most 2 calls in parallel (`RAILRADAR_CONCURRENCY`). A quota message stops all calls until next month. RailRadar's own error text is shown in the UI.
- `GET /api/seats?train=17307&from=SBC&to=SUR&date=2026-10-20&cls=3A&quota=GN` checks one leg.
- Statuses come from RailRadar, not directly from IRCTC, so confirm on IRCTC or RailOne before paying.

## Run

```bash
# backend
cd backend
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
pytest -q

# frontend (dev, proxies /api to :8000)
cd frontend
npm install
npm run dev          # http://localhost:5173
```

To deploy as a single process, run `npm run build` in `frontend/`. FastAPI then serves `frontend/dist` at `/`.

## Deploy

The `Dockerfile` builds the React app and runs FastAPI, which serves the API and the UI from one container on `$PORT`.

**Render (free tier, redeploys on every push to `main`)**
1. Go to [dashboard.render.com](https://dashboard.render.com) → **New → Blueprint** and pick this repo.
2. Render reads `render.yaml` and deploys. After that, `git push` is the deploy.

The free tier sleeps after about 15 minutes of inactivity, so the first request after that takes around 30 seconds.

**Anywhere else:** `docker build -t rail-planner . && docker run -p 8000:8000 rail-planner`

On every push and PR, CI (`.github/workflows/ci.yml`) runs the backend tests, builds the frontend, then builds and smoke-tests the Docker image.

## API

- `GET /api/stations?q=pune`
- `GET /api/routes?from=SBC&to=PUNE&date=2026-10-20&extra_hours=3&extra_km=150&nearby_km=15&min_transfer_min=20&include_unreserved=false&limit=50`. Add `no_time_limit=true` or `no_km_limit=true` to remove either limit, `max_changes=3` for more changes, `via=SRR,MAQ,TNA` to force stations in order, `via_stay=0,7,0` for planned stops (hours) at them, `via_radius=0,15,0` for a km buffer around each (any station that close counts), `max_wait_hours=2` to cap waiting at a station, `trains=17307,12158` to keep only routes using those trains, and `depart_after=18:00&arrive_by=2026-10-21T12:00` for a time window. `GET /api/trains?q=basava` looks trains up.
- `GET /api/booking-windows?date=2026-10-20&train=12627&board=BPL`
- `POST /api/seats` with `{"cls": "3A", "quota": "GN", "fresh": false, "legs": [{"train": "17307", "from": "SBC", "to": "SUR", "date": "2026-10-20", "classes": ["2A","3A","SL"]}]}`

## Timetable data

**Default: stored timetable, `backend/data/timetable.json.gz`.** Every train with its halts, times, distances, classes and **running days**, 0.9 MB, loaded at boot. Route search and the booking calendar use it, so they make **no RailRadar requests**. RailRadar's 10-requests-a-minute limit is left for seat checks.
- Current file: the Indian Railways timetable as of **September 2024**, from the [RSTGCN dataset](https://github.com/KoyenaChowdhury/RSTGCN) (IIT Kharagpur): 3,877 trains (express, superfast, Rajdhani, Shatabdi, Vande Bharat and specials) and 4,718 stations. Suburban, passenger and MEMU trains are mostly not included.
- Running days are the weekdays each train actually left its origin in September 2024, taken from that month's run records. 1,418 trains run daily and 1,336 weekly. Halt times are the scheduled times from the same records, because the dataset's route file has broken times for some trains.
- Coordinates, states and coach classes come from [datameet/railways](https://github.com/datameet/railways). 275 stations missing there are placed along the line between neighbouring halts.
- Things that changed after September 2024 aren't in it (new trains, retimings), and many specials (0xxxx) no longer run. The UI says so. Station codes are current (e.g. CSMT, not CSTM).
- To rebuild:

```bash
git clone --depth 1 https://github.com/KoyenaChowdhury/RSTGCN.git /tmp/rstgcn
unzip -q /tmp/rstgcn/Indian-Railway-Network-and-Delays.zip -d /tmp/rstgcn
git clone --depth 1 https://github.com/datameet/railways.git /tmp/railways
python backend/scripts/build_timetable_2024.py /tmp/rstgcn/Indian-Railway-Network-and-Delays /tmp/railways backend/data/timetable.json.gz
```

**Add newly introduced trains (GitHub Action):** `.github/workflows/refresh-timetable.yml` scans the 300 busiest stations' RailRadar boards, fetches only the trains not in the file yet (`crawl_railradar.py --new-only`), and commits the result, which redeploys the app. It runs on the 1st of every month and on demand (Actions → Refresh timetable → Run workflow; choose `full` to refresh every train instead). It needs the repo secret `RAILRADAR_API_KEY`. A run costs about 300 requests plus one per new train; existing trains are left as they are, and the file's `meta.added` lists what was added.

**Refresh it to today's timetable with RailRadar:** `backend/scripts/crawl_railradar.py` fetches `GET /v1/trains/{number}` for every train in the file (one request each) and writes the result back to the same file.
- It paces itself (9 requests/min by default), stops at `--max` requests per run (default 900) and stops cleanly on a quota or key error.
- Every response is cached in `backend/data/railradar-crawl.sqlite3` (git-ignored, 45 days), so re-running continues where it stopped and never re-fetches. A full crawl of about 4,000 trains is about 7.5 hours of requests, so spread it over as many runs or months as your quota needs.
- Until the crawl completes, crawled trains replace their stored entries, trains RailRadar doesn't know (withdrawn) are dropped, and the rest stay as they were. The file's `meta` records how far it got.
- `--stations 50` also scans the 50 busiest station boards on the first run to find trains that are new since 2024.

```bash
cd backend
RAILRADAR_API_KEY=rr_live_... python scripts/crawl_railradar.py --max 900   # repeat until it says "complete"
git add data/timetable.json.gz && git commit -m "Refresh timetable from RailRadar"
```

**Live timetables (optional): `TIMETABLE_SOURCE=live`.** Routes then come from [RailRadar](https://railradar.in/docs) station boards (`GET /v1/stations/{code}/trains`) instead of the stored file. Set `RAILRADAR_API_KEY` too (on Render: service → Environment).
- A leg A→B is any train on both boards that reaches B after A. Change stations are ranked from the stored network's shape (never its clock times), and the top 10 are queried, skipping any within the nearby radius of either end.
- A new route costs about 16 requests, and up to 30 with 2+ changes, which is more than the 10-a-minute limit. Station boards are cached in SQLite for 7 days (`RAILRADAR_CACHE`, default `backend/data/railradar-cache.sqlite3`), so repeat searches are free. Render's free tier wipes the cache on restart.
- If the key is rejected or the quota runs out, the app falls back to the stored timetable and says so in the UI.

**Seat availability** always uses RailRadar and needs `RAILRADAR_API_KEY`, whichever timetable source is set.

The previous fallback, a ~2016–17 snapshot from datameet without running days, can still be built with `backend/scripts/build_timetable.py`.

`GET /api/status` shows the timetable source and its date, whether seat checks are available, and this month's API request count.

Booking rules are in `app/rules.py`, as of September 2026. Update the constants if IRCTC changes them.

This project does not log in to, scrape, or book on IRCTC or RailOne.
