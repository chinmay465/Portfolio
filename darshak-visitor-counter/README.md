# Darshak · visitor counter

Counts the people who visit the portfolio site (`portfolio-home`), with **one entry per visitor** however many pages they open, reload or come back to.

## How it counts

1. On its first visit, a browser gets a random id (`crypto.randomUUID()`), kept in `localStorage` as `darshak:id`.
2. Once per browser session, `portfolio-home` (`src/lib/visitor.ts`) sends `{ id, path, referrer }` to `POST /api/visit`. Route changes inside the site send nothing.
3. The server upserts on that id: a new id adds a row, a known id only bumps `sessions` and `last_seen`. One row per visitor, always.

Skipped: dev and preview builds, automated browsers (`navigator.webdriver`), bot user agents (crawlers, link previews, headless Chrome) and browsers that opted out. Open the site once with `?notrack` to stop counting your own visits; `?track` undoes it.

Stored per visitor: the id, first and last seen, session count, landing page (path only, no query string), the referring site's host name and device type. No cookies, and IPs are never stored (they're held in memory for a minute for rate limiting).

Limits: one person on two devices or browsers counts twice, and clearing site data makes a returning visitor look new. Counting closer than that needs fingerprinting or sign-in.

## API

| Route | |
| --- | --- |
| `POST /api/visit` | Body (text/plain JSON): `{ "id": uuid, "path": "/projects", "referrer": "https://…" }`. Only origins in `ALLOWED_ORIGINS`; 30 per IP per minute. Answers `{ counted, new }`. |
| `GET /api/stats?days=30` | `Authorization: Bearer <STATS_TOKEN>`. Totals (all time, new today, seen today, 7 and 30 days, returning), new visitors per IST day, top landing pages, referrers and devices. |
| `GET /api/health` | Health check. |

The service URL serves the dashboard, which asks for the token once per browser.

## Configuration

| Variable | |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. Neon's free tier works (`postgres://…?sslmode=require`). Without it the service uses PGlite, an embedded Postgres on local disk, which Render's free plan wipes on every deploy. |
| `STATS_TOKEN` | Protects the stats. Render generates it from `render.yaml`. |
| `ALLOWED_ORIGINS` | Comma-separated sites that may send visits, e.g. `https://chinmay-upare.onrender.com`. Add the custom domain when it's live. |
| `DARSHAK_DATA_DIR` | PGlite folder when `DATABASE_URL` isn't set (default `./data`; `memory://` for in-memory). |

`portfolio-home` sends to `https://darshak-visitor-counter.onrender.com` by default; set `VITE_VISITOR_API` at build time if the service gets another URL.

## Run locally

```bash
npm install
npm run dev     # API on :3000, dashboard on :5173
npm test
```
