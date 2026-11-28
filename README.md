# Portfolio

Side projects by Chinmay Upare, one folder per project. Each web project is a standalone React + TypeScript app, deployed on Render from `render.yaml` — a static site, except Shodh, Setu and Darshak, which need a backend and run as Node web services. Rail Planner is a Python (FastAPI) backend with a React front end, deployed as one Docker service.

| Project | What it is | Live | Code |
| --- | --- | --- | --- |
| **Home** | Personal site and index for everything here: about me, a scroll-driven career journey, before-and-after results, full experience, and an animated preview of every project. | [chinmay-upare.onrender.com](https://chinmay-upare.onrender.com) | [`portfolio-home/`](./portfolio-home) |
| **Rail Planner** | Indian Railways booking-window calculator and alternate-route finder: general and Tatkal windows for every leg, routes through via stations within your limits on time, distance and changes, and live seat availability. FastAPI + React in one Docker image. | [chinmay-rail-planner.onrender.com](https://chinmay-rail-planner.onrender.com) | [`rail-planner/`](./rail-planner) |
| **Ekatra** | One YouTube-style recommendation feed across Netflix, Prime Video, JioHotstar, SonyLIV and ZEE5. Each title opens on its own service. | [ekatra-streaming-hub.onrender.com](https://ekatra-streaming-hub.onrender.com) | [`ekatra-streaming-hub/`](./ekatra-streaming-hub) |
| **Ank** | Bilingual hub for today's Marathi epapers, with city editions and date links. | [ank-marathi-epapers.onrender.com](https://ank-marathi-epapers.onrender.com) | [`ank-marathi-epapers/`](./ank-marathi-epapers) |
| **Shodh** | Live monitor for public paste sites — watches for keyword mentions and streams matches into a feed. React front end over an Express + SSE backend. | [shodh-paste-monitor.onrender.com](https://shodh-paste-monitor.onrender.com) | [`shodh-paste-monitor/`](./shodh-paste-monitor) |
| **Setu** | Free-proxy hub: pulls public proxy lists, validates and rotates them, and exposes them as a search/browse UI, a fetch API for scrapers (Shodh uses it) and a local VPN-like tunnel. | [setu-proxy-hub.onrender.com](https://setu-proxy-hub.onrender.com) | [`setu-proxy-hub/`](./setu-proxy-hub) |
| **Darshak** | Unique-visitor counter for the portfolio site: one entry per visitor however many pages they open, with an open dashboard of daily visitors, landing pages, sources and devices. No cookies and no IPs stored. Express + Postgres, React dashboard. | [darshak-visitor-counter.onrender.com](https://darshak-visitor-counter.onrender.com) | [`darshak-visitor-counter/`](./darshak-visitor-counter) |
| **Kavach** | Android ad blocker for every app: a local VPN catches DNS lookups and blocks about 76k ad and tracker domains, with no root and no remote server. Kotlin, not a web app. | APK from the CI run (`kavach-debug-apk`) | [`kavach-adblock/`](./kavach-adblock) |
| **Swar** | A YouTube Music player of its own for Android: native Home, Search, Library and player screens, its own playback engine (Media3 ExoPlayer), background play and no ads. Kotlin + Jetpack Compose, not a web app. | [Interactive demo](https://chinmay-upare.onrender.com/projects/swar#demo) on the portfolio site | Private repository |

## Deploy

On [dashboard.render.com](https://dashboard.render.com), go to **New → Blueprint** and pick this repo. Render reads `render.yaml` and creates one service per project — static sites for the landing page, Ekatra and Ank, Node web services for Shodh, Setu and Darshak, and a Docker web service for Rail Planner. After that, every push to `main` redeploys.

CI (`.github/workflows/ci.yml`) runs one job per project on every push and PR: install, test, build and a smoke test. For Kavach, the job runs the unit tests and uploads the debug APK as the `kavach-debug-apk` artifact. Pull requests that touch `portfolio-home/` also run Lighthouse CI (`.github/workflows/home-lighthouse.yml`), which fails below the landing page's score budget.
