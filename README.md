# Portfolio

Frontend side projects by Chinmay Upare, one folder per project. Each folder is a standalone React + TypeScript app, deployed on Render from `render.yaml` — a static site, except Shodh, which needs a backend and runs as a Node web service.

| Project | What it is | Live | Code |
| --- | --- | --- | --- |
| **Ekatra** | One YouTube-style recommendation feed across Netflix, Prime Video, JioHotstar, SonyLIV and ZEE5. Each title opens on its own service. | [ekatra-streaming-hub.onrender.com](https://ekatra-streaming-hub.onrender.com) | [`ekatra-streaming-hub/`](./ekatra-streaming-hub) |
| **Ank** | Bilingual hub for today's Marathi epapers, with city editions and date links. | [ank-marathi-epapers.onrender.com](https://ank-marathi-epapers.onrender.com) | [`ank-marathi-epapers/`](./ank-marathi-epapers) |
| **Shodh** | Live monitor for public paste sites — watches for keyword mentions and streams matches into a feed. React front end over an Express + SSE backend. | [shodh-paste-monitor.onrender.com](https://shodh-paste-monitor.onrender.com) | [`shodh-paste-monitor/`](./shodh-paste-monitor) |

## Deploy

On [dashboard.render.com](https://dashboard.render.com), go to **New → Blueprint** and pick this repo. Render reads `render.yaml` and creates one service per project — static sites for Ekatra and Ank, a Node web service for Shodh. After that, every push to `main` redeploys.

CI (`.github/workflows/ci.yml`) runs one job per project on every push and PR: install, test, build and a smoke test.
