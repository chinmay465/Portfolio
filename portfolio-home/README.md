# Portfolio home

The landing page for this repo: one place that links to every app, and a showcase piece in its own right.

**Live:** [chinmay-upare.onrender.com](https://chinmay-upare.onrender.com) · part of the [Portfolio](../README.md) repo

## What's on it

- **Particle hero:** a canvas of a few thousand particles that assemble into चिन्मय, then morph through each project's Devanagari name (एकत्र, अंक, शोध, सेतु, कवच, स्वर). They scatter away from the pointer and burst on click. Hovering an app in the status panel morphs the field to that app's name
- **Decoding headline:** the name resolves out of mixed Devanagari and Latin glyphs, and runs again on hover
- **Live status:** Kavach and Swar, the Android apps, show as Android app rows that link to their APKs. Each web app is pinged from the visitor's browser on load and every 30 s, with latency bars. The ping also wakes Render's sleeping free services, so they're warm by the time someone clicks through
- **Project panels:** each app gets a Devanagari outline that draws itself on scroll, its features and stack, links to the live app (or, for the Android apps, the APK) and its folder, and an animated sketch of what it does: Ekatra's scrolling feed, Ank's flipping mastheads, Shodh's live match stream, Setu's proxy routing with retries and evictions, Kavach's DNS lookups getting stopped or let through, and Swar's queue losing its ads while the screen turns off and the music keeps going. The sketches tilt in 3D with a glare that follows the pointer, and pause when off screen
- **Command palette:** `Ctrl K`, `⌘ K` or `/` to jump to any app, its code or a section
- Cursor ring and spotlight, scroll progress line, stack marquee, magnetic buttons
- Everything respects `prefers-reduced-motion`; keyboard focus is visible throughout

## Stack

React 19, TypeScript, Vite, Vitest and oxlint. No UI or animation library: the canvas, SVG and CSS are hand-written. Fonts are self-hosted with Fontsource: Unbounded for display, Anek Latin and Anek Devanagari for text.

```
src/
  data/projects.ts            project catalogue (add an app here)
  lib/scramble.ts             headline decode frames (+ tests)
  lib/ping.ts                 status ping and classification (+ tests)
  lib/format.ts               Devanagari numerals and Marathi dates
  components/GlyphField.tsx   particle hero
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
