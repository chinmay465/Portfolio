# Portfolio home

The landing page for this repo: one place that links to every app, and a showcase piece in its own right.

**Live:** [chinmay-upare.onrender.com](https://chinmay-upare.onrender.com) · part of the [Portfolio](../README.md) repo

## What's on it

A personal site and an index of everything in this repo. Everything about Chinmay comes from his resume (`src/data/profile.ts`, no phone number by design).

- **Particle hero:** a canvas of a few thousand particles that assemble into चिन्मय, then morph through each project's name. They scatter away from the pointer and burst on click. An "At a glance" card beside the name sums up the current role, previous role, focus, stack and education, and lists the side projects with live status; hovering one morphs the particles to its name
- **Decoding headline:** the name resolves out of mixed glyphs, and runs again on hover
- **About me:** the lead lights up word by word as you scroll; three working principles on cursor-spotlight cards
- **Journey:** a pinned scroll scene from MIT AoE Pune through Paytm Money and the promotion to KredX in Bangalore. The timeline fills, the year decodes, and a dot travels from Pune to Bangalore
- **Before and after:** five results in a bento grid; the old value is struck out and the new one counts or decodes in
- **Experience:** every role in full in an animated accordion, plus education
- **Projects:** each app with a self-drawing outline of its name, features, stack, live ping and an animated sketch of what it does (Ekatra, Ank, Shodh, Setu, Kavach). The pings also wake Render's sleeping services
- **Skills marquee and contact:** email with a copy button, LinkedIn and GitHub
- Headings rise out of a mask on scroll, cursor ring and spotlight, scroll progress line, magnetic buttons, `Ctrl K` / `⌘ K` / `/` command palette
- Everything respects `prefers-reduced-motion`; keyboard focus is visible throughout

## Stack

React 19, TypeScript, Vite, Vitest and oxlint. No UI or animation library: the canvas, SVG and CSS are hand-written. Fonts are self-hosted with Fontsource: Unbounded for display, Anek Latin and Anek Devanagari for text.

```
src/
  data/profile.ts             about, journey, impact, experience, skills
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
