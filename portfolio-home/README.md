# Portfolio home

The landing page for this repo: one place that links to every app, and a showcase piece in its own right.

**Live:** [chinmay-upare.onrender.com](https://chinmay-upare.onrender.com) · part of the [Portfolio](../README.md) repo

## What's on it

A personal site split into short pages, so no page runs long. Everything about Chinmay comes from his resume (`src/data/profile.ts`, no phone number by design).

| Route | What's there |
| --- | --- |
| `/` | Skills board hero, the name, an At a glance card, four featured projects, three results, contact |
| `/about` | About me, working principles, the career journey slider, skills |
| `/experience` | Before-and-after results, every role in an accordion, education |
| `/projects` | All seven apps as cards, filterable by web or Android (`?type=web`, `?type=android`) |
| `/projects/:id` | One app in full: features, stack, live status, links, animated sketch, previous and next |
| `/contact` | Email with copy button, LinkedIn, GitHub |
| anything else | A 404 page |

**Effects:** a particle skills board (React, AI-assisted dev, TypeScript and more, each with what was built with it), a decoding name and page titles, project cards whose animated preview plays on hover (or mid-screen on touch devices), a swipeable journey slider that autoplays until touched, before-and-after numbers that count in, an animated role accordion, cursor-spotlight cards, page transitions, a cursor ring, magnetic buttons and a `Ctrl K` / `⌘ K` / `/` command palette that reaches every page and link.

**Production details:** React Router with real paths, a per-route title and description, every page except Home loaded on first visit, scroll restored on back and reset on new pages, a phone menu, a route loading bar, an error page, and a Render rewrite so deep links and refreshes work. A `sitemap.xml` (linked from `robots.txt`) lists every page, and Open Graph and Twitter card tags give links a 1200×630 preview image on LinkedIn, WhatsApp and X. Everything respects `prefers-reduced-motion`; keyboard focus is visible throughout.

## Stack

React 19, TypeScript, Vite, Vitest, Playwright and oxlint. No UI or animation library: the canvas, SVG and CSS are hand-written. Fonts are self-hosted with Fontsource: Unbounded for display, Anek Latin and Anek Devanagari for text.

```
src/
  router.tsx                  routes; Home is eager, other pages load on demand
  routes/                     Layout (nav, menu, footer) and one file per page
  data/profile.ts             about, journey, impact, experience, skills
  data/projects.ts            project catalogue (add an app here)
  lib/scramble.ts             headline decode frames (+ tests)
  lib/ping.ts                 status ping and classification (+ tests)
  lib/format.ts               Devanagari numerals and Marathi dates
  test/dom.ts                 browser stubs for component tests
  components/Hero.tsx         skills board, name, At a glance
  components/GlyphField.tsx   particle canvas
  components/ProjectCard.tsx  card with hover-to-play preview
  components/visuals/         animated sketches, one per app
  components/CommandPalette.tsx
public/sitemap.xml            every page and project page (kept in step by site.test.ts)
public/og-image.png           link preview image, rendered from scripts/og-image.html
e2e/                          Playwright specs: every route, deep links, the command palette
```

## Tests

- **Unit (Vitest):** `src/lib/lib.test.ts` covers the headline decode, status ping classification, Marathi formatting, and the project, profile and route data.
- **Site files (Vitest):** `src/lib/site.test.ts` checks that `sitemap.xml` lists exactly the router's pages and every project, that `robots.txt` links it, and that the preview tags point at a PNG that really is 1200×630 and under 300 KB.
- **Components (Vitest + Testing Library, jsdom):** `ImpactRow` counts from the old value to the new one frame by frame and shows the final value at once with reduced motion; `RoleAccordion` keeps one role open at a time with matching `aria-expanded`; `/projects` shows the right cards for `?type=web`, `?type=android` and the tabs. `src/test/dom.ts` stubs the browser APIs jsdom lacks (IntersectionObserver, animation frames, ResizeObserver, matchMedia) so tests can scroll rows into view and step frames.
- **End to end (Playwright, Chromium):** `e2e/` visits every page and every `/projects/:id`, unknown paths and ids (404), opens deep links directly and refreshes them, and drives the `Ctrl K` palette by keyboard and mouse. It also checks that the build serves the sitemap, `robots.txt` and the preview image as real files. Requests to the live apps are blocked so results never depend on Render, and any uncaught page error fails the test. CI runs it against `vite preview` after the build; on failure the HTML report is uploaded as `home-playwright-report`.
- **Lighthouse (Lighthouse CI):** on pull requests that touch `portfolio-home/`, `.github/workflows/home-lighthouse.yml` audits `/`, `/about`, `/experience`, `/projects`, `/projects/ekatra` and `/contact` three times each (Lighthouse's default mobile profile) and fails if a page's median score drops below the budget in `lighthouserc.json`:

  | Category | Minimum |
  | --- | --- |
  | Performance | 65 |
  | Accessibility | 95 |
  | Best practices | 95 |

  The build is served compressed with path rewrites, as Render does. The reports are uploaded as `home-lighthouse-report`. To change the budget, edit `lighthouserc.json` and say why in the PR.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm test
npm run build    # static output in dist/
npm run test:e2e # Playwright against vite preview; build first
npm run lighthouse # Lighthouse CI against dist/ with the score budget; build first, needs Chrome
npm run og-image # re-render public/og-image.png after editing scripts/og-image.html

# Preview build for hosts that can't rewrite paths: hash routes, relative assets
VITE_HASH_ROUTER=1 VITE_BASE=./ npx vite build --outDir dist-preview
```
