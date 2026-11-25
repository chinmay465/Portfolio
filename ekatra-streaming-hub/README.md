# Ekatra · one feed for every streaming app

A YouTube-style home feed that recommends across Netflix, Prime Video, JioHotstar, SonyLIV and ZEE5 at once. You pick the services you pay for, tell it what you liked, and get one ranked feed. Each title opens on its own service.

**Live:** [ekatra-streaming-hub.onrender.com](https://ekatra-streaming-hub.onrender.com) · part of the [Portfolio](../README.md) repo

## Why it links out instead of playing

Netflix and Prime streams are DRM-protected and only play in their own apps and sites. The services also don't offer public APIs for watch history. So Ekatra does the discovery layer: one catalog, one taste profile, one feed. Playback is a hand-off: on phones, the "Open in Netflix" and "Open in Prime Video" links open the app.

## Features

- **Home feed** with YouTube-style filter chips (series, films, genres). Each card says why it's there: "Because you liked Mirzapur" or "Popular on SonyLIV"
- **"Because you liked …" shelf** and a **watchlist shelf**
- **Mixed across services:** the ranking avoids long runs from one service or genre, so the feed doesn't turn into a Netflix page
- **Onboarding:** pick your services, then tap a few titles you enjoyed to seed the feed
- **Like, dislike, watchlist and watched** on every title. Dislikes push similar titles down
- **Import Netflix history:** load Netflix's viewing-activity CSV. It's parsed in the browser and never uploaded. Episode rows roll up to their show, and titles with colons, like *Glass Onion: A Knives Out Mystery*, still match
- **Two catalogs**
  - *Demo* (default, works offline): about 55 originals and exclusives across the five services
  - *Live from TMDB*: paste a free [TMDB API key](https://www.themoviedb.org/settings/api) in settings. The app then pulls the most popular subscription titles in India for each of your services, searches all of TMDB, and shows real posters, ratings and streaming availability. TMDB's streaming data comes from JustWatch. The key is stored in your browser and only sent to `api.themoviedb.org`
- Library views (watchlist, liked, history), search on `/`, light and dark themes, a mobile bottom-sheet layout, and reduced-motion support
- **Keyboard-friendly dialogs:** the title sheet, settings and onboarding keep Tab inside, close on Escape and hand focus back to whatever opened them

## How the recommendations work

Content-based and fully client-side (`src/lib/recommend.ts`):

1. Each title becomes a feature vector: genres, tags, original language, series or film, and decade
2. Your taste profile is the weighted sum of titles you reacted to: like +1, watched up to +1 depending on play count, watchlist +0.5, dislike −1
3. Each unseen title on your services scores `0.7 × cosine(profile, title) + 0.2 × popularity + 0.1 × quality`, minus a penalty for similarity to anything you disliked
4. A greedy re-rank lowers the score of a pick when the last few picks share its service or genre
5. Each pick is explained by the liked or watched title it's closest to, if that similarity is above 0.45

With no signals yet, the feed falls back to popularity on your services.

## Stack

React 19, TypeScript, Vite, Vitest with React Testing Library, and oxlint. There's no UI library: the styles are hand-written CSS built on design tokens, with Space Grotesk and Inter self-hosted through Fontsource. Thumbnails for the demo catalog are generated typographic artwork, so the app ships no third-party images.

```
src/
  data/catalog.ts          demo catalog (originals only)
  data/providers.ts        services: colours, search/home links, TMDB name matching
  lib/recommend.ts         vectors, taste profile, ranking, diversity (+ tests)
  lib/netflixHistory.ts    CSV parser and title matching (+ tests)
  lib/tmdb.ts              live catalog, search, providers for India (+ tests)
  lib/links.ts             hand-off links to each service (+ tests)
  lib/signals.ts           like/dislike/watchlist/watched rules (+ tests)
  components/              cards, thumbnails, modal, title sheet, onboarding, settings (+ modal tests)
  App.tsx
```

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm test
npm run lint
npm run build    # static output in dist/
```

## Deploy

Render deploys it from the repo-root `render.yaml`, alongside Ank, as a free static site that redeploys on every push to `main`. CI runs lint, tests, the build and a smoke test.

## Notes

- Ekatra doesn't host, embed or play any content.
- The demo catalog lists each service's own originals, since licensed titles move between services often. Live mode uses current TMDB/JustWatch availability for India.
- **Opening a title:** Netflix titles open on their own `netflix.com/title/<id>` page, which opens the app on phones. JioHotstar's title links need a content id that can't be looked up from outside India, so those buttons go to the show's JustWatch India page, whose "Watch now" button opens the exact title in JioHotstar. Prime Video uses its own search. Everything else, and every live-mode title without a known page, goes to TMDB's watch page or a JustWatch search, both of which link straight to the title on each service.
- This product uses the TMDB API but is not endorsed or certified by TMDB.
