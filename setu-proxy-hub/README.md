# सेतु · Setu

A hub of validated free HTTP proxies. Setu pulls public proxy lists, keeps only
the proxies that actually work, and lets you use them three ways:

- **Browse & search** through a proxy from its own UI, in a clean, script-free reader view
- **Call it from any app**: a fetch API your scrapers can use as a drop-in for `fetch()`, plus a search API
- **VPN-like tunnel**: a local proxy on `127.0.0.1:8899` you can point your browser, OS or scripts at

Shodh uses it to route its HTML sources through rotating IPs.

Part of the [Portfolio](../README.md) repo.

## How the pool works

1. **Sources**: auto-updated, open-source lists: ProxyScrape's free API,
   [monosans/proxy-list](https://github.com/monosans/proxy-list),
   [proxifly/free-proxy-list](https://github.com/proxifly/free-proxy-list) and
   [TheSpeedX/PROXY-List](https://github.com/TheSpeedX/PROXY-List). Override with
   `SETU_SOURCES="name=https://…,name=https://…"`.
2. **Validation**: every candidate must open an HTTPS tunnel (CONNECT) to a judge
   (`api.ipify.org`), return a well-formed answer and show an IP that isn't yours.
   Transparent proxies that leak your IP, and proxies that inject junk, are dropped.
   Usually only 2–10% of a free list passes.
3. **Rotation**: requests go to a random proxy among the fastest few. On a network error
   or a block-ish status (403/429/5xx), Setu retries on a different proxy. Three hard
   failures in a row evict a proxy. The pool re-checks every 15 minutes and refills
   itself when it runs low.
4. **Sticky mode**: a hostname can stay on one proxy for 10 minutes, so a site sees one IP per session.

Proxies listed by more than one source are tested first, because they're the most likely to still be alive.

## Security model

Free proxies are run by strangers. Setu is built around that:

- **HTTPS only by default.** Everything is tunnelled with CONNECT, and TLS is end-to-end
  with the real site, with the certificate verified. The proxy sees the hostname and
  traffic volume, but it can't read or change pages. Plain `http://` is refused
  unless you set `SETU_ALLOW_HTTP=1`.
- **Interceptors are banned.** A proxy that answers HTTPS with its own certificate
  (trying to read the traffic) fails verification and is banned for good, both
  during validation and during use.
- **No rendering of fetched pages.** The UI shows a reader view (text and links only),
  so nothing on a fetched page runs or loads resources from your real IP. `format=raw`
  responses carry `Content-Security-Policy: sandbox`.
- **No relaying into private networks.** localhost, RFC 1918, link-local and `.local` targets are blocked.
- **Tunnel is loopback-only.** It binds `127.0.0.1` and only allows ports 443/8443 (80 with `SETU_ALLOW_HTTP`).
- **Public deploys are locked by default.** On Render, `/api/fetch` and `/api/search`
  only work with `SETU_TOKEN`. Without it Setu won't act as an open relay.

Don't sign in to anything important (banking, email, work) through a free proxy.
For real privacy, use a proper VPN.

## Run

```bash
npm install
npm run dev      # UI on http://localhost:5174, API on :3001, tunnel on 127.0.0.1:8899
npm test
npm run build
npm start        # production: Express serves dist/ + API on :3001 (or $PORT), plus the tunnel
```

The first proxies usually show up 10–20 seconds after start.

## Use it from other apps

**As a normal proxy** (tunnel, local only):

```bash
curl -x http://127.0.0.1:8899 https://api.ipify.org
export HTTPS_PROXY=http://127.0.0.1:8899           # most CLIs and SDKs
chrome --proxy-server="http://127.0.0.1:8899" --user-data-dir=/tmp/setu-profile
```

For the whole computer, use `http://127.0.0.1:8899/proxy.pac` as the automatic
proxy configuration URL (macOS: Network → Proxies; Windows: Proxy → Use setup script).

**Fetch API**:

```bash
# raw = target status + body + content type; drop-in for fetch()
curl -H "Authorization: Bearer $SETU_TOKEN" \
  "http://localhost:3001/api/fetch?format=raw&sticky=1&url=https%3A%2F%2Fexample.com"

# POST for forms / custom headers
curl -X POST http://localhost:3001/api/fetch -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com/search","method":"POST","body":"q=x","format":"json"}'
```

Response headers `X-Setu-Proxy`, `X-Setu-Exit-Ip` and `X-Setu-Final-Url` say which
proxy served it. `format=json` returns `{ meta, body }`, and `format=reader` returns
`{ meta, page: { title, blocks, links } }`.

**Search API**: `GET /api/search?q=…&engine=duckduckgo|ddg-lite|bing|yahoo|mojeek` returns
`{ engine, results: [{ title, url, snippet }], proxy, exitIp }`. Search engines bot-check
free proxy IPs, so each engine tries up to 5 different proxies. Without `engine`, all
engines run in parallel and the first one that returns results wins.

**Pool**: `GET /api/pool`, `POST /api/pool/refresh`, `GET /api/tunnel`.

## Configuration

| Env | Default | What it does |
| --- | --- | --- |
| `PORT` | `3001` | UI + API port |
| `SETU_TOKEN` | — | Bearer token for every API call. Required for relaying on public hosts |
| `SETU_TUNNEL` | `1` locally, `0` on Render | Run the VPN-like tunnel |
| `SETU_TUNNEL_PORT` | `8899` | Tunnel port (always `127.0.0.1`) |
| `SETU_ALLOW_HTTP` | `0` | Allow plain `http://` targets |
| `SETU_SOURCES` | built-in list | `name=https://url,…` |
| `SETU_SEED` | — | Your own proxies, `host:port,…`. Pinned, so they're never dropped |
| `SETU_TARGET_SIZE` | `60` | Stop validating once this many are alive |
| `SETU_MAX_CANDIDATES` | `600` | New candidates tested per refresh |
| `SETU_JUDGE_URL` | `https://api.ipify.org?format=json` | Validation endpoint (must return `{"ip": "…"}`) |
| `SETU_NO_REFRESH` | `0` | Skip list fetching (CI, or `SETU_SEED` only) |

## Deploy

`render.yaml` defines Setu as a Node web service with a generated `SETU_TOKEN`, and passes its URL and token to Shodh.
Find the token under the service's **Environment** tab, and paste it into the UI when it asks.
On the free tier the service sleeps when idle, and the pool rebuilds in about 20 seconds after it wakes.
The tunnel is only for running Setu on your own machine.

## Stack

React 19 + TypeScript + Vite on the front end. The backend is Express, run with `tsx`,
with no proxy libraries: CONNECT tunnelling, TLS, decompression and the forward proxy
are written on `node:net`, `node:tls` and `node:http`. Tests (Vitest) run real
sockets: a local CONNECT proxy stands in for a free proxy, and they cover validation,
rotation and eviction, redirects, the tunnel, auth and the guard.

```
server/
  sources.ts      list sources + parser
  tunnel.ts       CONNECT handshake through an upstream proxy
  httpClient.ts   one HTTP(S) request over a tunnel (TLS verified, gzip/br)
  pool.ts         validation, scoring, rotation, sticky sessions, eviction
  fetcher.ts      rotating fetch with retries + guarded redirects
  search.ts       DuckDuckGo / Mojeek HTML search + parsers
  reader.ts       HTML → script-free reader view
  tunnelServer.ts local VPN-like proxy (CONNECT + plain HTTP + PAC)
  guard.ts        URL / host checks
  app.ts          REST API;  index.ts  wiring + env
src/              React UI: Browse, Pool, Tunnel, API tabs
```
