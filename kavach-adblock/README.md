# Kavach — system-wide ad blocker for Android

Kavach blocks ads and trackers in every app on the phone by running a local VPN. It doesn't need root and doesn't send your traffic to any outside server.

Optional **proxy mode** (Android 10+) also reroutes apps' web traffic through free proxies from [Setu](../setu-proxy-hub), switching to another proxy when one fails, while ad blocking keeps working.

## How it works

```
 any app ──DNS lookup──▶ [ Kavach local VPN ] ──blocked?──▶ NXDOMAIN (ad never loads)
                                  │
                                  └──allowed──▶ encrypted DoH (Cloudflare → Quad9) ──▶ real answer back to app
 any app ──all other traffic──▶ normal Wi-Fi / mobile data (never touches Kavach)
```

- `VpnService` creates a tun interface whose **DNS server is a virtual address** (`10.111.222.53`) that exists only inside the tunnel. Only that one address is routed into the tunnel.
- Android sends every app's DNS lookups to the VPN's DNS server, so Kavach sees all of them. Video, downloads and the rest of the traffic go straight to the network, so the phone keeps full speed and the battery cost is close to zero.
- Each query's domain is checked against the blocklist, and a listed domain also covers its subdomains. Blocked domains get an NXDOMAIN reply. Allowed queries are forwarded over **DNS-over-HTTPS** to Cloudflare, with Quad9 as the fallback, and the answer is sent back to the app. Kavach's own traffic is excluded from the VPN, so these requests can't loop back into it.
- The blocklist is a bundled starter list merged with [StevenBlack/hosts](https://github.com/StevenBlack/hosts) (about 76k ad and malware domains). The full list downloads on first launch and again whenever you tap **Update blocklist**.

## Features

- One-tap on/off, plus a persistent notification with a **Stop** action
- Live counters for blocked domains, total lookups and blocklist size
- A "Recently blocked" list: tap a domain to **allow** it when an app breaks
- **Block domain**: add any ad server yourself. Your blocks win over the downloaded list and over allows, and cover subdomains. Wildcards work too: `rr*---sn-ccoa-*.googlevideo.com` blocks every server in that group (`*` matches within one part of the name, and the last two parts must be written out)
- **Live lookups** (off by default): shows every domain apps look up right now, so you can spot an app's ad server and tap to block it
- **My rules**: everything you've blocked or allowed, tap a rule to remove it
- **Export / Clear**: share the list on screen as text (newest first, ✕ = blocked). Tap **Clear**, use one app, then **Export** to get that app's lookups
- Works with Android's **Always-on VPN** (Settings → Network → VPN → Kavach → Always-on), so it survives reboots
- **Proxy mode**: routes apps through free proxies from Setu, with automatic failover. See below

## Proxy mode

Turn on **Proxy mode** under the main button. The first time, Kavach asks for Setu's token (`SETU_TOKEN` from the `setu-proxy-hub` service's **Environment** tab on Render).

```
 any app ──web traffic──▶ [ Kavach loopback proxy 127.0.0.1 ] ──ad host?──▶ 403 (blocked)
                                     │
                                     └──allowed──▶ free proxy from Setu ──▶ site
```

1. Kavach gets the validated pool from Setu (`GET /api/pool`). A sleeping Render free instance takes up to a minute to wake.
2. It tests up to 40 of them **from the phone** with an HTTPS request to Cloudflare's trace page, keeps up to 8 that work, and orders them by latency. TLS is verified, so a proxy that intercepts HTTPS fails the test.
3. The VPN hands every app Kavach's own proxy on `127.0.0.1`. That proxy blocks ad hosts (with a proxy set, apps don't do their own DNS lookups, so blocking happens here) and forwards the rest to the current free proxy.
4. If a free proxy fails, the connection is retried on the next one straight away, and a proxy that fails twice in a row is dropped. Every 60 s Kavach re-tests the current proxy and tops the pool up from Setu when fewer than 3 are left. With none working, apps go direct (still ad-blocked by DNS) and Kavach keeps retrying.

**Proxy settings:**

- **Setu server**: defaults to `https://setu-proxy-hub.onrender.com`. Must be https.
- **Setu token**: stored in Kavach's private storage, never backed up. Use **No token** for a Setu running without one.
- **Switch proxy**: only when it fails (default), or every 5/15/30/60 min. **Switch proxy** on the main screen or in the notification moves to the next proxy at once.
- **Apps that skip the proxy**: Google Pay, PhonePe, Paytm, Paytm Money, BHIM and the main bank apps are ticked by default. Skipped apps use your normal connection and also skip ad blocking, because Android can only leave a whole app out of a VPN.

**What to know:**

- HTTPS goes through as a `CONNECT` tunnel, so the free proxy sees which site you open but not what you send. Plain HTTP is readable by the proxy's operator.
- Apps that ignore Android's proxy setting (some games, apps with their own networking, non-HTTP traffic such as UDP or QUIC) go direct as before. Chrome and most apps follow it.
- Free proxies are slow and short-lived. Expect lower speed than your normal connection.

## Privacy

Kavach sees every domain your apps look up, so it's built to keep none of it:

- **Nothing is stored or uploaded.** There are no analytics, ads or crash-reporting SDKs, and no server of our own. The only network calls are DoH lookups and the blocklist download, plus, only with proxy mode on, Setu's pool and the proxy tests.
- **Lookups are encrypted.** With plain DNS, your Wi-Fi owner or carrier can read every domain you look up. With DoH they only see a connection to Cloudflare or Quad9, and both state they don't store your IP address with your queries. There is no plaintext fallback.
- **Nothing reaches the logs.** Domains are never written to logcat, files or the database. By default the only domain record is the "Recently blocked" list (the last 50 *blocked* domains, in memory only), which disappears when the app process ends. Allowed lookups are only counted.
- **Live lookups are opt-in.** The switch is off on every app start. While it's on, the last 500 looked-up domains are kept in memory so you can see them, and turning it off wipes them. They're never saved to storage, and they leave the app only when you tap **Export** and pick where to share them.
- **Your rules stay on the phone.** Domains you block or allow are stored in the app's private storage, and they're excluded from backups.
- **Other apps can't reach in.** The VPN service needs `BIND_VPN_SERVICE`, which only the system holds. The only exported components are the launcher entries (the main screen, **Kavach On** and **Kavach Off**), and they take no input. There are no content providers and no shared storage. The only listening socket is proxy mode's proxy, which exists only while proxy mode is on and is bound to `127.0.0.1`, so nothing on the Wi-Fi or mobile network can reach it.
- **No backups.** `allowBackup=false` plus data-extraction rules keep the allowlist out of cloud backups and phone-to-phone transfers. Cleartext HTTP is disabled.
- **A generic User-Agent.** Requests send `Kavach` instead of Android's default, which names your phone model and Android version.

CI enforces this on every build: `scripts/privacy-check.sh` inspects the final APK and fails if it gains a permission, an exported component, code from a tracking SDK, a network endpoint that hasn't been reviewed, or a listening socket other than the loopback-only proxy.

## Build

Requirements: Android Studio (Ladybug or newer) or JDK 17 + Android SDK 35.

```bash
./gradlew assembleDebug        # APK → app/build/outputs/apk/debug/app-debug.apk
./gradlew testDebugUnitTest    # packet, blocklist and proxy-mode unit tests
```

**From GitHub instead of a PC:** the repo's CI (`.github/workflows/ci.yml`, job `kavach`) runs the tests and builds the APK on every push and PR. Download `kavach-debug-apk` from the run's **Artifacts** section, unzip it and install `app-debug.apk` (allow installing from unknown sources).

## Project layout

| File | Role |
|---|---|
| `vpn/AdBlockVpnService.kt` | Sets up the VPN, the foreground notification and start/stop |
| `vpn/DnsTunnel.kt` | poll() loop on the tun fd; blocks or forwards each query |
| `vpn/Packets.kt` | IPv4/UDP/DNS parsing and reply building, including checksums |
| `vpn/DomainSet.kt` | Hosts-file parser and subdomain-aware matching |
| `vpn/Blocklist.kt` | Loads, downloads and allowlists domains |
| `vpn/AdBlockState.kt` | StateFlows shared by the service and the UI |
| `proxy/ProxyManager.kt` | Proxy mode: fetches and tests proxies, health checks, rotation, failover to direct |
| `proxy/LocalProxy.kt` | Loopback HTTP proxy handed to apps: blocks ad hosts, forwards to the current free proxy |
| `proxy/UpstreamPool.kt` | Working proxies, fastest first; drops ones that keep failing |
| `proxy/SetuClient.kt` | Reads Setu's `/api/pool` |
| `proxy/ProxyChecker.kt` | Tests a proxy from the phone and reads its exit IP |
| `proxy/ProxySettings.kt` | Proxy mode settings |
| `MainActivity.kt` | The single screen |

## Turn on automatically when an app opens

Kavach adds two extra icons, **Kavach On** and **Kavach Off**. Each switches protection and closes immediately, without opening a screen. Automation apps can open them. On a Samsung phone with **Modes and Routines**:

1. Open Modes and Routines → **Routines** → **+**.
2. **If:** App opened → **JioHotstar**.
3. **Then:** Apps → Open an app → **Kavach On**.
4. To turn it off afterwards, add **Kavach Off** as the action that runs when the routine ends, if your One UI version offers that.

The first time, open Kavach and tap **Turn on** once to allow its VPN. Or use **Always-on VPN** (Settings → Connections → More connection settings → VPN → ⚙️ Kavach) to keep it on all the time. Kavach only handles DNS lookups, so that costs almost no battery.

Like any launcher icon, other apps can start these two entries too. They only switch protection on or off and take no input.

## Finding an app's ad server

1. Turn on **Show live lookups**.
2. Force-stop the app (long-press its icon → App info → Force stop), then open it and wait for an ad.
3. Look for domains with `ads`, `adserver`, `pubads` or `vast` in the name that showed up when the ad loaded. Tap one and choose **Block**.
4. Force-stop the app again and check. If the app stops working, allow the domain again from **My rules**.

## Known limits (true of every DNS-based blocker)

- **Private DNS:** if Settings → Private DNS is set to a specific hostname, Android sends DNS over TLS straight to that host and Kavach never sees it. Set it to *Off* or *Automatic*.
- **Chrome "Secure DNS"** and some apps use their own DNS-over-HTTPS, which bypasses the VPN. Turn off Secure DNS in Chrome settings.
- **YouTube, Instagram and Google Search/Discover ads** come from the same domains as the real content, so DNS blocking can't remove them without breaking the app. Video ads stitched into a live stream (common in live sport) can't be removed either.
- Only one VPN can run at a time. Starting another VPN app turns Kavach off.
- Proxy mode needs Android 10 or newer, the first Android version that lets a VPN set a proxy for apps.
- DNS over TCP isn't handled. It's rare and only used for oversized answers.
- **Hotel or airport Wi-Fi sign-in pages:** DoH can't connect until you've signed in, so turn Kavach off, sign in, then turn it back on. The same applies on networks that block Cloudflare and Quad9.

## Ideas for v2

- A Quick Settings tile to toggle from the notification shade
- Extra blocklist sources (AdGuard DNS filter, OISD) chosen in settings
- A per-app log of which app asked for which domain, using `ConnectivityManager.getConnectionOwnerUid`
