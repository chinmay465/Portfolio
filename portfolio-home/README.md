# Portfolio home

The landing page for this repo: one place that links to every app, and a showcase piece in its own right.

**Live:** [chinmay-upare.onrender.com](https://chinmay-upare.onrender.com) · part of the [Portfolio](../README.md) repo

## What's on it

A personal site told in chapters, on a dark night-sky canvas. Everything about Chinmay comes from his resume (`src/data/profile.ts`, no phone number by design).

- **One particle system for the whole page:** a fixed canvas behind everything re-forms into a Devanagari word for each chapter: चिन्मय in the hero, नमस्कार in About, the career years २०१८ → २०२५ → आज in the journey, each app's name in its own colour, and पुन्हा भेटू at the end. Particles drift with the pointer for depth, get pushed by scroll speed, and burst on click in the hero
- **Journey:** a pinned scene. Scrolling walks from MIT AoE Pune through Paytm Money, the promotion, and the move to KredX in Bangalore, while a dot travels the route from पुणे to बंगळुरू
- **Before and after:** five results; the old value gets struck out and the new one counts or decodes in
- **About, full experience, education, skills and contact** (email with a copy button, LinkedIn, GitHub)
- **Projects:** one full-screen chapter per app with an animated sketch of what it does and a live ping for the web apps (which also wakes Render's sleeping services)
- A chapter rail shows where you are, in Marathi and English; every heading carries its Marathi twin
- `Ctrl K`, `⌘ K` or `/` opens a command palette; reduced motion is respected throughout

## Stack

React 19, TypeScript, Vite, Vitest and oxlint. No UI or animation library: the canvas, SVG and CSS are hand-written. Type is Anek throughout, self-hosted with Fontsource: Anek Latin and Anek Devanagari are one design, so English and Marathi match.

```
src/
  data/profile.ts             about, impact, experience, education, skills
  data/projects.ts            project catalogue (add an app here)
  lib/scramble.ts             headline decode frames (+ tests)
  lib/ping.ts                 status ping and classification (+ tests)
  lib/format.ts               Devanagari numerals and Marathi dates
  components/ParticleStage.tsx page-wide particle canvas
  components/Journey.tsx      pinned career scene
  components/visuals/         animated sketches, one per app
  components/CommandPalette.tsx
  App.tsx
```

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm test
npm run build    # static output in dist/
```
