# Portfolio

Side projects by Chinmay Upare, one folder per project. Each web project is a standalone React + TypeScript app, deployed on Render from `render.yaml` — a static site, except Shodh and Setu, which need a backend and run as Node web services.

| Project | What it is | Live | Code |
| --- | --- | --- | --- |
| **Home** | Personal site and index for everything here: about me, a scroll-driven career journey, before-and-after results, full experience, and an animated preview of every project. | [chinmay-upare.onrender.com](https://chinmay-upare.onrender.com) | [`portfolio-home/`](./portfolio-home) |
| **Ekatra** | One YouTube-style recommendation feed across Netflix, Prime Video, JioHotstar, SonyLIV and ZEE5. Each title opens on its own service. | [ekatra-streaming-hub.onrender.com](https://ekatra-streaming-hub.onrender.com) | [`ekatra-streaming-hub/`](./ekatra-streaming-hub) |
| **Ank** | Bilingual hub for today's Marathi epapers, with city editions and date links. | [ank-marathi-epapers.onrender.com](https://ank-marathi-epapers.onrender.com) | [`ank-marathi-epapers/`](./ank-marathi-epapers) |
| **Shodh** | Live monitor for public paste sites — watches for keyword mentions and streams matches into a feed. React front end over an Express + SSE backend. | [shodh-paste-monitor.onrender.com](https://shodh-paste-monitor.onrender.com) | [`shodh-paste-monitor/`](./shodh-paste-monitor) |
| **Setu** | Free-proxy hub: pulls public proxy lists, validates and rotates them, and exposes them as a search/browse UI, a fetch API for scrapers (Shodh uses it) and a local VPN-like tunnel. | [setu-proxy-hub.onrender.com](https://setu-proxy-hub.onrender.com) | [`setu-proxy-hub/`](./setu-proxy-hub) |
| **Kavach** | Android ad blocker for every app: a local VPN catches DNS lookups and blocks about 76k ad and tracker domains, with no root and no remote server. Kotlin, not a web app. | APK from the CI run (`kavach-debug-apk`) | [`kavach-adblock/`](./kavach-adblock) |
| **Swar** | YouTube Music for Android that keeps playing with the screen off or in the background, with ads stripped and lock-screen controls. A WebView wrapper around music.youtube.com, so your library and recommendations come along. Kotlin, not a web app. | APK from the CI run (`swar-debug-apk`) | [`swar-music/`](./swar-music) |

## Deploy

On [dashboard.render.com](https://dashboard.render.com), go to **New → Blueprint** and pick this repo. Render reads `render.yaml` and creates one service per project — static sites for the landing page, Ekatra and Ank, Node web services for Shodh and Setu. After that, every push to `main` redeploys.

CI (`.github/workflows/ci.yml`) runs one job per project on every push and PR: install, test, build and a smoke test. For the Android apps, the jobs run the unit tests and upload the debug APKs as the `kavach-debug-apk` and `swar-debug-apk` artifacts.
