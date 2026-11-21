# Kavach — system-wide ad blocker for Android

Kavach blocks ads and trackers in every app on the phone by running a local VPN. It doesn't need root and doesn't send your traffic to any outside server.

## How it works

```
 any app ──DNS lookup──▶ [ Kavach local VPN ] ──blocked?──▶ NXDOMAIN (ad never loads)
                                  │
                                  └──allowed──▶ 1.1.1.1 / 8.8.8.8 ──▶ real answer back to app
 any app ──all other traffic──▶ normal Wi-Fi / mobile data (never touches Kavach)
```

- `VpnService` creates a tun interface whose **DNS server is a virtual address** (`10.111.222.53`) that exists only inside the tunnel. Only that one address is routed into the tunnel.
- Android sends every app's DNS lookups to the VPN's DNS server, so Kavach sees all of them. Video, downloads and the rest of the traffic go straight to the network, so the phone keeps full speed and the battery cost is close to zero.
- Each query's domain is checked against the blocklist, and a listed domain also covers its subdomains. Blocked domains get an NXDOMAIN reply. Allowed queries are forwarded to Cloudflare or Google DNS over a `protect()`ed socket, and the answer is sent back to the app.
- The blocklist is a bundled starter list merged with [StevenBlack/hosts](https://github.com/StevenBlack/hosts) (about 76k ad and malware domains). The full list downloads on first launch and again whenever you tap **Update blocklist**.

## Features

- One-tap on/off, plus a persistent notification with a **Stop** action
- Live counters for blocked domains, total lookups and blocklist size
- A "Recently blocked" list: tap a domain to **allow** it when an app breaks
- Works with Android's **Always-on VPN** (Settings → Network → VPN → Kavach → Always-on), so it survives reboots

## Build

Requirements: Android Studio (Ladybug or newer) or JDK 17 + Android SDK 35.

```bash
./gradlew assembleDebug        # APK → app/build/outputs/apk/debug/app-debug.apk
./gradlew testDebugUnitTest    # packet + blocklist unit tests
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
| `MainActivity.kt` | The single screen |

## Known limits (true of every DNS-based blocker)

- **Private DNS:** if Settings → Private DNS is set to a specific hostname, Android sends DNS over TLS straight to that host and Kavach never sees it. Set it to *Off* or *Automatic*.
- **Chrome "Secure DNS"** and some apps use their own DNS-over-HTTPS, which bypasses the VPN. Turn off Secure DNS in Chrome settings.
- **YouTube and Instagram ads** come from the same domains as the real content, so DNS blocking can't remove them without breaking the app.
- Only one VPN can run at a time. Starting another VPN app turns Kavach off.
- DNS over TCP isn't handled. It's rare and only used for oversized answers.

## Ideas for v2

- A Quick Settings tile to toggle from the notification shade
- Extra blocklist sources (AdGuard DNS filter, OISD) chosen in settings
- Upstream DNS over HTTPS, so lookups are also encrypted
- A per-app log of which app asked for which domain, using `ConnectivityManager.getConnectionOwnerUid`
