# Portfolio home

The landing page for this repo: one place that links to every app, and a showcase piece in its own right.

**Live:** [chinmay-upare.onrender.com](https://chinmay-upare.onrender.com) · part of the [Portfolio](../README.md) repo

## What's on it

A personal site first, project index second. Everything about Chinmay comes from his resume (`src/data/profile.ts`, no phone number by design).

- **Hero:** a full-bleed saffron field where ink particles spell चिन्मय, then each project's Devanagari name. They scatter from the pointer and burst on click. The name decodes out of mixed Devanagari and Latin glyphs
- **About me:** a short first-person intro and three working principles
- **Before and after:** five results from work at KredX and Paytm Money; the old value is struck out and the new one counts or decodes in as it scrolls into view
- **Experience and education:** KredX and Paytm Money with both roles and dates, plus MIT Academy of Engineering, Pune
- **Projects:** each app gets its own colour block with its Devanagari name and an animated sketch of what it does (Ekatra's feed, Ank's mastheads, Shodh's match stream, Setu's proxy routing, Kavach's DNS filtering). Web apps are pinged live from the visitor's browser, which also wakes Render's sleeping services
- **Skills and contact:** grouped skills, email with a copy button, LinkedIn and GitHub
- Every section heading carries its Marathi twin (माझ्याविषयी, फरक, अनुभव, प्रकल्प, कौशल्य, संपर्क)
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
