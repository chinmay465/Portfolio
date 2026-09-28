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
| Extra travel time | 3 h | max time over the fastest direct train |
| Extra distance | 150 km | max rail km over the shortest direct train |
| Nearby stations within | 15 km | also board or alight at busy stations nearby (e.g. YPR/BNC/KJM for SBC) |
| Minimum change time | 45 min | for one-change routes |

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
- `GET /api/routes?from=SBC&to=PUNE&date=2026-10-20&extra_hours=3&extra_km=150&nearby_km=15&min_transfer_min=45&include_unreserved=false`
- `GET /api/booking-windows?date=2026-10-20&train=12627&board=BPL`

## Data: read before trusting results

`backend/data/timetable.json.gz` is built from the open [datameet/railways](https://github.com/datameet/railways) dataset, a ~2016–17 snapshot. It has:
- **no running days**, so every train is treated as daily
- **no live availability or fares**
- timings and train numbers that may have changed since then

The search code only depends on the `Timetable` protocol in `app/timetable.py`. To get current results, implement that protocol against a live timetable source and set `Train.runs_on`, which is already honoured by the search. To rebuild the bundled file:

```bash
git clone --depth 1 https://github.com/datameet/railways.git /tmp/railways
python backend/scripts/build_timetable.py /tmp/railways backend/data/timetable.json.gz
```

Booking rules are in `app/rules.py`, as of September 2026. Update the constants if IRCTC changes them.

This project does not log in to, scrape, or book on IRCTC or RailOne.
