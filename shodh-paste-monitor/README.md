# शोध · Shodh

A live monitor for public paste sites. Give it keywords and it watches incoming
pastes, streaming every match into a feed in real time — built for brand and
threat-intel monitoring (spotting mentions of your company, product or domain).

**Live:** [shodh-paste-monitor.onrender.com](https://shodh-paste-monitor.onrender.com) · part of the [Portfolio](../README.md) repo

## Features

- **Multiple keywords, all checked.** Every keyword is tested against every
  paste, and each match shows exactly which keywords hit — not just that one did
- **Any / All match modes:** match on any keyword, or only when all are present.
  Plus whole-word and case-sensitive toggles
- **Live feed over Server-Sent Events.** Press Start and a timer runs; new
  matches append at the bottom with the source, matched keywords, a highlighted
  snippet and a link. Press Stop any time
- **Pluggable sources.** Ships with a **mock** source so it runs with no external
  account, a **Pastebin** provider (via their official scraping API), and a
  **generic HTML-archive** provider you point at any site with a public recent/
  archive page
- Running counters for pastes scanned, matches found and source errors

> It finds *public mentions* of your keywords. There is deliberately no
> "extract username/password" step — this is a monitor, not a credential
> collector.

## Stack

React 19, TypeScript, Vite and Vitest on the front end; a small Express backend
(run with [`tsx`](https://tsx.is)) does the polling and serves the built app. No
UI library — hand-written CSS on design tokens. The paste sites can't be read
from the browser (CORS), so the polling, matching and SSE fan-out live in the
backend; the front end is a thin client over its REST + SSE API.

```
server/
  index.ts            Express: /api/start, /api/stop, /api/stream (SSE), serves dist/
  monitor.ts          polling engine — dedup, stats, emits matches
  matcher.ts          keyword matching (all keywords; any/all mode) + tests
  providers/          mock.ts, pastebin.ts, htmlArchive.ts, index.ts (registry)
  net.ts              direct vs. Setu-routed fetch for providers
src/
  lib/api.ts          start/stop + EventSource client
  lib/format.ts       elapsed timer + snippet highlighting (+ tests)
  components/          Controls, Feed, FeedRow
  App.tsx
```

## Run

```bash
npm install
npm run dev      # web on http://localhost:5173, API on :3000 (proxied)
npm test
npm run build    # front end -> dist/
npm start        # production: Express serves dist/ + the API on :3000 (or $PORT)
```

## Sources

- **Mock** (default) — fabricates pastes locally and sprinkles in your keywords
  so you can see the feed and matching work with no account. Not real data.
- **Pastebin** — uses Pastebin's official scraping API, which only works from a
  server IP whitelisted against a Pastebin PRO account. Without it the API
  returns an access error, which the app surfaces in the feed. (Scraping
  pastebin.com any other way breaks their terms, so this provider won't.)
- **Custom HTML source** — give it a name, an archive URL and CSS selectors for
  the item links and body. Use only on sites whose ToS and `robots.txt` permit
  it, with a polite poll interval. Tick **Route through Setu proxies** to fetch
  its pages from [Setu](../setu-proxy-hub)'s rotating free-proxy pool instead of
  this server's IP.

### Routing through Setu

Set `SETU_URL` (for example `http://localhost:3001`) and, if your Setu has one,
`SETU_TOKEN` on the Shodh server. The switch in the custom HTML source then sends
every archive and item fetch through Setu's `/api/fetch`. Errors from Setu itself,
such as an empty pool or a wrong token, show up in the feed as source errors. On
Render, `render.yaml` wires both variables from the Setu service for you. Pastebin
is never proxied, because its API only answers your whitelisted IP.

## Deploy

**Render (Node web service, redeploys on every push to `main`)**
1. Go to [dashboard.render.com](https://dashboard.render.com) → **New → Blueprint** and pick the Portfolio repo.
2. Render reads `render.yaml`, runs `npm ci && npm run build` and starts it with `npm start`. After that, `git push` is the deploy.

Unlike the static sites in this repo, this is a Node service — on Render's free
tier it sleeps after inactivity, so the first request after idle has a cold
start.

On every push and PR, CI (`.github/workflows/ci.yml`) lints, tests, builds and
smoke-tests the running server.

## Responsible use

For monitoring public mentions of terms you have a legitimate interest in.
Respect each site's terms of service and rate limits, don't use it to collect
personal data or credentials, and follow the laws that apply where you operate.
