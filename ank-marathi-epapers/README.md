# अंक · Ank

A bilingual (Marathi / English) hub for today's Marathi epapers. Pick a paper and it opens on the publisher's official site.

**Papers:** Sakal, Lokmat, Maharashtra Times, Loksatta, Pudhari, Punya Nagari, Tarun Bharat

## Features

- Today's date in Marathi, with Devanagari numerals and Marathi month and weekday names
- **Read today:** a paper is marked as read when you open it, and the marks reset at midnight. A progress row in the header tracks what you've read
- **Favourites:** pinned to the top and saved across visits
- **City and date links:** pick a city and an issue date, and each paper opens straight to that city's edition for that date. Sakal, Lokmat and Pudhari support this. Tarun Bharat and Loksatta open the city's latest issue (their links can't pick a date). The others open their epaper home, because their sites didn't expose edition links
- **City filter:** Pune by default. Papers with no edition in your city are greyed out, with a "Not available for Pune" tooltip, and open their main epaper if clicked
- Search in either script (`लोक` or `lok` both work); press `/` to focus search
- Light and dark themes, a Marathi/English UI toggle, and an installable PWA manifest
- Responsive layout, visible keyboard focus and reduced-motion support

## Stack

React 19, TypeScript, Vite and Vitest. Fonts are self-hosted with Fontsource: Tiro Devanagari Marathi for the mastheads and Anek Devanagari for the UI. There's no UI library; the styles are hand-written CSS built on design tokens.

```
src/
  data/papers.ts        paper + city catalogue (add a paper here)
  i18n.ts               typed Marathi/English strings
  lib/format.ts         Devanagari numerals, Marathi dates, search matching (+ tests)
  lib/storage.ts        localStorage-backed state with in-memory fallback
  components/PaperCard.tsx
  App.tsx
```

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm test
npm run build    # static output in dist/
```

## Deploy

**Render (free static site, redeploys on every push to `main`)**
1. Go to [dashboard.render.com](https://dashboard.render.com) → **New → Blueprint** and pick the Portfolio repo.
2. Render reads `render.yaml` at the repo root, builds this folder and serves `dist/`. After that, `git push` is the deploy.

Static sites on Render don't sleep, so there's no cold start.

On every push and PR, CI (`.github/workflows/ci.yml`) runs the tests, builds the app and smoke-tests the built page.

## Adding a paper

Add an entry to `PAPERS` in `src/data/papers.ts` with the official epaper URL, founding year, headquarters, edition cities and a hue for the masthead tint. To link straight to editions, add `editions` (the publisher's code for each city) and `editionUrl` (how their URL is built). `src/lib/links.test.ts` checks each format.

## Note

Ank only links to each publisher's official epaper. Some papers need a free sign-up or a subscription to read the full issue.
