# Portfolio home

The landing page for this repo: one place that links to every app, and a showcase piece in its own right.

**Live:** [chinmay-upare.onrender.com](https://chinmay-upare.onrender.com) · part of the [Portfolio](../README.md) repo

## What's on it

A personal site split into short pages, so no page runs long. Everything about Chinmay comes from his resume (`src/data/profile.ts`, no phone number by design).

| Route | What's there |
| --- | --- |
| `/` | Skills board hero, the name, an At a glance card, three featured projects, three results, contact |
| `/about` | About me, working principles, the career journey slider, skills |
| `/experience` | Before-and-after results, every role in an accordion, education |
| `/projects` | All six apps as cards, filterable by web or Android (`?type=web`, `?type=android`) |
| `/projects/:id` | One app in full: features, stack, live status, links, animated sketch, previous and next |
| `/contact` | Email with copy button, LinkedIn, GitHub |
| anything else | A 404 page |

**Effects:** a particle skills board (React, AI-assisted dev, TypeScript and more, each with what was built with it), a decoding name and page titles, project cards whose animated preview plays on hover (or mid-screen on touch devices), a swipeable journey slider that autoplays until touched, before-and-after numbers that count in, an animated role accordion, cursor-spotlight cards, page transitions, a cursor ring, magnetic buttons and a `Ctrl K` / `⌘ K` / `/` command palette that reaches every page and link.

**Production details:** React Router with real paths, a per-route title and description, every page except Home loaded on first visit, scroll restored on back and reset on new pages, a phone menu, a route loading bar, an error page, and a Render rewrite so deep links and refreshes work. Everything respects `prefers-reduced-motion`; keyboard focus is visible throughout.

## Stack

React 19, TypeScript, Vite, Vitest and oxlint. No UI or animation library: the canvas, SVG and CSS are hand-written. Fonts are self-hosted with Fontsource: Unbounded for display, Anek Latin and Anek Devanagari for text.

```
src/
  router.tsx                  routes; Home is eager, other pages load on demand
  routes/                     Layout (nav, menu, footer) and one file per page
  data/profile.ts             about, journey, impact, experience, skills
  data/projects.ts            project catalogue (add an app here)
  lib/scramble.ts             headline decode frames (+ tests)
  lib/ping.ts                 status ping and classification (+ tests)
  lib/format.ts               Devanagari numerals and Marathi dates
  components/Hero.tsx         skills board, name, At a glance
  components/GlyphField.tsx   particle canvas
  components/ProjectCard.tsx  card with hover-to-play preview
  components/visuals/         animated sketches, one per app
  components/CommandPalette.tsx
```

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm test
npm run build    # static output in dist/

# Preview build for hosts that can't rewrite paths: hash routes, relative assets
VITE_HASH_ROUTER=1 VITE_BASE=./ npx vite build --outDir dist-preview
```
