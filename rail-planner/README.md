# Rail Planner

**Live:** https://chinmay-rail-planner.onrender.com (free tier, so the first load after a pause takes about 30 s)

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

Rail Planner lives in the [Portfolio](../README.md) repo and deploys from its root `render.yaml` as the `chinmay-rail-planner` Docker service (rootDir `rail-planner`), so every push to `main` that touches this folder redeploys it. Set `RAILRADAR_API_KEY` in the Render dashboard; it powers seat availability.

The `Dockerfile` builds the React app and runs FastAPI, which serves the API and the UI from one container on `$PORT`. The free tier sleeps after about 15 minutes of inactivity, so the first request after that takes around 30 seconds.

**Timetable updates:** `.github/workflows/rail-timetable.yml` at the repo root adds newly introduced trains on the 1st of every month (or on demand from the Actions tab) and commits `backend/data/timetable.json.gz`. It needs the repo secret `RAILRADAR_API_KEY`.

**Anywhere else:** `docker build -t rail-planner . && docker run -p 8000:8000 rail-planner`
