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
| Extra travel time | 3 h | max time over the fastest direct train; any value, or **No limit** |
| Extra distance | 150 km | max rail km over the shortest direct train; any value, or **No limit** |
| Max changes | 1 | any number; 0 = direct trains only |
| Via stations | none | stations the route must pass through, in order (changing there or staying on the train) |
| Nearby stations within | 15 km | also board or alight at busy stations nearby (e.g. YPR/BNC/KJM for SBC); any value |
| Minimum change time | 20 min | for one-change routes; any value. Changes under 45 min are flagged "Tight change" |

Routes with 2 or more changes, or with via stations, come from a round-by-round search (one train per round) over the useful stations: both ends, nearby stations, the best-connected change points, and your via stations. It keeps the earliest few partial routes per station each round and prunes anything that can't meet your limits. If via stations are set but nothing fits your limits, the results say how many routes exist beyond them and how long the fastest takes, with a one-click "Remove limits". With live data, 2+ changes adds up to 16 more station timetables (cached and shared), about 30 requests for a brand-new route.

There are no built-in upper bounds, and no hidden layover cap: the wait between trains is limited only by your total-time setting. Results come back 50 at a time, fastest first, and "Show more alternates" loads the next 50.

Alternates are either a direct train from or to a nearby station, or a two-train route with one change. If no direct train exists, the best alternate becomes the baseline. When you change the inputs, results refresh automatically. The last trip, recent trips and your tolerance settings are saved in the browser.

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
- `GET /api/routes?from=SBC&to=PUNE&date=2026-10-20&extra_hours=3&extra_km=150&nearby_km=15&min_transfer_min=20&include_unreserved=false&limit=50`. Add `no_time_limit=true` or `no_km_limit=true` to remove either limit, `max_changes=3` for more changes, and `via=SRR,MAQ,TNA` to force stations in order.
- `GET /api/booking-windows?date=2026-10-20&train=12627&board=BPL`

## Timetable data

**Live (recommended): [RailRadar](https://railradar.in/docs).** Set `RAILRADAR_API_KEY` (on Render: service → Environment). This gives current trains, times, distances and running days.
- Trains come from station timetables: `GET /v1/stations/{code}/trains`, one request per station. A leg A→B is any train on both timetables that reaches B after A. Direct trains, nearby stations and both legs of a one-change route all come from intersecting these timetables.
- Change stations are ranked using only the shape of the network: how many trains link each station to both ends, within the distance tolerance. Timings from the old snapshot are never used, because a connection that was impossible in 2016 can be the best one now (e.g. Basava 17307 → Hutatma 12158 at Solapur). The top 10 are queried, skipping any within the nearby radius of either end.
- Running days are enforced for every leg. A train that doesn't run on your date (counted from its origin) is dropped, and the second leg waits for that train's next running day.
- The booking calendar uses `GET /v1/trains/{number}` and warns when the train doesn't run on the chosen date.
- A new route costs at most about 16 requests (2 ends + 4 nearby + 10 change stations), and the free tier allows 1,000 a month. Station timetables are cached in SQLite for 7 days and shared across routes (SBC, PUNE, SUR, DD… are reused), and running days are applied locally, so a repeat search on any date costs 0 requests. The cache file is `RAILRADAR_CACHE` (default `backend/data/railradar-cache.sqlite3`). Render's free tier wipes it on restart, so mount a disk there if you need it to last.
- If the key is rejected or the quota runs out, the app falls back to the snapshot and says so in the UI.
- Coach classes come from `coachPosition` when available, otherwise from the snapshot.

**Fallback: offline snapshot.** `backend/data/timetable.json.gz` is built from [datameet/railways](https://github.com/datameet/railways), a ~2016–17 snapshot with no running days (every train is treated as daily). The UI shows a warning whenever results come from it. To rebuild it:

```bash
git clone --depth 1 https://github.com/datameet/railways.git /tmp/railways
python backend/scripts/build_timetable.py /tmp/railways backend/data/timetable.json.gz
```

`GET /api/status` shows which source is active and this month's API request count.

Booking rules are in `app/rules.py`, as of September 2026. Update the constants if IRCTC changes them.

This project does not log in to, scrape, or book on IRCTC or RailOne.
