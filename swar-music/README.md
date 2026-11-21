# Swar — YouTube Music that keeps playing in the background

Swar wraps [music.youtube.com](https://music.youtube.com) in an Android app. Music keeps playing with the screen off or another app open, ads are stripped before they play, and the notification, lock screen and headset buttons all control playback. You sign in with your own account, so your library, playlists and recommendations come with you.

## How it works

```
 ┌──────────────── MainActivity ────────────────┐      ┌────── PlaybackService ──────┐
 │ WebView → music.youtube.com                  │      │ foreground service           │
 │   swar.js (injected before the page loads)   │      │ (type mediaPlayback)         │
 │   • page always "visible"                    │state │ • media notification         │
 │   • ad data removed from API responses       │ ───▶ │ • MediaSession: lock screen, │
 │   • leftover ads muted + skipped             │      │   headset, Bluetooth         │
 │   • reports what's playing                   │ ◀─── │ • wake lock                  │
 │ shouldInterceptRequest → AdFilter            │ cmds │ • pause on headphones unplug │
 └──────────────────────────────────────────────┘      └──────────────────────────────┘
```

- **Background play.** YouTube Music's web player pauses when the Page Visibility API says the tab is hidden. `swar.js` runs before the page's own scripts (`WebViewCompat.addDocumentStartJavaScript`) and makes `document.hidden` always `false`. It also swallows `visibilitychange` events. The activity never calls `WebView.onPause()`, which is what would stop media. The foreground service keeps the process alive and holds a partial wake lock while music plays.
- **No ads, in three layers.**
  1. *Data:* `JSON.parse`, `Response.json()` and the embedded `ytInitialPlayerResponse` are wrapped so `adPlacements`, `playerAds`, `adSlots` and ad renderers are removed before the player reads them. With no ad scheduled, nothing plays. This is the same approach uBlock Origin uses.
  2. *Network:* `AdFilter` returns an empty response for ad servers (DoubleClick, AdSense, IMA SDK), YouTube's ad endpoints (`/pagead/`, `/api/stats/ads`, `/ptracking`, …) and telemetry (see Privacy). Service-worker requests go through the same filter.
  3. *Fallback:* if an ad still starts, it's muted, jumped to its end, and Skip is clicked. Premium upsell banners are hidden with CSS. The "Are you still there?" dialog is dismissed automatically.
- **Controls.** The page reports title, artist, album art, position and play state over a `WebMessageListener` bridge (origin-locked to `https://music.youtube.com`). `PlaybackService` mirrors that into a `MediaSession`. Commands go back as JavaScript, and the page's own media-session handlers are called first so the queue logic stays YouTube's.
- **Audio focus.** WebView takes audio focus for the song itself, so Android pauses or ducks it for calls and other music apps. Swar doesn't request focus on top of that: a second request from the same app takes focus away from WebView and pauses the song. Swar does pause when headphones are unplugged.
- **Links.** Sign-in stays inside the app. `intent://` "open in the YouTube Music app" links are blocked. Other sites open in your browser. Shared `music.youtube.com` links can be opened with Swar.

## App experience

The page is YouTube Music's own; around it Swar adds the parts a native app has:

- **Launch:** an animated splash screen (the logo's bars bouncing), handing over to a loading screen with the same bars. The loading screen lifts with a short zoom-and-fade once the page script reports that YouTube Music has drawn its UI, so you never see a half-built page. After 6 s it notes a slow connection.
- **Progress line:** a thin brand-gradient bar at the top while a page loads.
- **Offline screen:** instead of WebView's error page, a "Can't reach YouTube Music" screen with **Try again**. It also retries by itself as soon as the connection comes back.
- **Native feel:** no grey tap flashes, no text-selection handles on long-press, no rubber-band overscroll.
- **Back gesture:** inside the app, Back goes back a page. At the top on Android 12+, the system's predictive-back animation sends Swar to the background, and the music keeps going.
- **Icon:** gradient launcher icon with a themed (monochrome) version for Android 13+, and a matching notification icon.
- Everything respects Android's "Remove animations" setting.

## Privacy

Swar adds no tracking of its own, and blocks as much of Google's as it can without breaking playback.

- **Nothing from Swar.** There are no analytics, crash-reporting or ad SDKs and no server of our own. The only request Swar's own code makes is fetching album art from Google's image servers (`ytimg.com`, `ggpht.com`, `googleusercontent.com`), with a generic `Swar` user agent rather than one that names your phone. The page script talks only to the app, over a bridge limited to `https://music.youtube.com`, and contains no URLs.
- **No WebView telemetry.** Android System WebView can upload usage metrics for the apps that use it. Swar opts out in its manifest (`MetricsOptOut`). Safe Browsing lookups are off too: Swar only loads YouTube and Google sign-in pages, and every other link opens in your browser.
- **Google's telemetry blocked.** YouTube Music's client event logs (`/youtubei/v1/log_event`), quality-of-experience reports (`/api/stats/qoe`), page-timing and error beacons (`/csi_204`, `/gen_204`, `/error_204`), Google's shared logging endpoint (`play.google.com/log`), Google Analytics and Firebase logging all get an empty response, along with the ad servers and ad beacons.
- **What Google still sees.** You're signed in to your own account, so Google knows what you play. That's how YouTube Music works, not something an app can hide. The history pings (`/api/stats/playback`, `/api/stats/watchtime`) are left alone on purpose: your recommendations and "Listen again" come from them. To stop them too, pause YouTube History in your Google account, which also works for the official app. WebView also tells sites which app it's running in (an `X-Requested-With: com.chinmay.swar` header), and Android no longer lets apps turn that off.
- **Nothing stored outside the phone.** Backups and phone-to-phone transfers are off, so your signed-in session never leaves the device. Cleartext HTTP is disabled.

CI enforces this on every build: `scripts/privacy-check.sh` fails if the APK gains a permission, an exported component, a tracking SDK or an unreviewed network endpoint. It also fails if the page script gains a URL or a way to send data out, or if the WebView privacy settings are turned back on.

## Using it

1. Install the APK and open Swar. Allow notifications (Android 13+): the playback notification is what keeps music alive in the background.
2. Tap **Sign in** on YouTube Music and sign in to your Google account.
3. Play something, then lock the phone. Use the notification or lock screen to pause or skip.
4. **Back** at the top level sends Swar to the background without stopping the music. **Close** in the notification, or swiping Swar out of recents, stops it.

Works alongside [Kavach](../kavach-adblock). Kavach blocks ad domains across the phone; Swar removes the YouTube ads that DNS blocking can't.

## Known limits

- **Google sign-in.** Google refuses sign-in from some embedded browsers ("This browser or app may not be secure"). Swar sends Chrome's user agent instead of WebView's, which is usually enough. If Google still refuses on your phone, Swar works signed out: background play and ad blocking still work, but your library won't be there.
- **YouTube changes.** Ad blocking depends on YouTube's response format and class names. When YouTube changes them, update the key lists at the top of `swar.js`. If YouTube starts stitching ads into the audio stream itself (server-side ad insertion), the fallback still mutes and skips them, but they can no longer be removed before they play.
- **No offline downloads.** Downloading songs to keep is a YouTube Music Premium feature in the official app. Swar doesn't download or save audio.
- **Terms of Service.** Background play and ad blocking in a third-party client break YouTube's Terms of Service. Swar is for personal use and sideloading, not for the Play Store.

## Build

Requirements: Android Studio (Ladybug or newer) or JDK 17 + Android SDK 35.

```bash
./gradlew assembleDebug        # APK → app/build/outputs/apk/debug/app-debug.apk
./gradlew testDebugUnitTest    # AdFilter, NavPolicy, UserAgent, command tests
cd js-tests && npm ci && npm test   # swar.js in a simulated YouTube Music page (jsdom)
```

**From GitHub instead of a PC:** the repo's CI (`.github/workflows/ci.yml`, job `swar`) runs both test suites and builds the APK on every push and PR. Download `swar-debug-apk` from the run's **Artifacts** section, unzip it and install `app-debug.apk` (allow installing from unknown sources).

## Project layout

| File | Role |
|---|---|
| `assets/swar.js` | Page script: visibility override, ad-data pruning, ad fallback, state bridge, commands |
| `MainActivity.kt` | WebView setup, request filtering, link policy, page → app messages |
| `ui/Shell.kt`, `ui/EqualizerView.kt` | Loading and offline screens, progress line, animated equalizer |
| `CrashLog.kt` | Saves a crash report on the phone and shows it on next launch |
| `playback/PlaybackService.kt` | Foreground service, notification, MediaSession, wake lock, headphone unplug |
| `playback/PlayerBridge.kt` | Shared state flow and command channel between the activity and the service |
| `web/AdFilter.kt` | Ad and telemetry hosts and endpoints blocked at the network level |
| `web/NavPolicy.kt` | Which links stay in the app, open outside or are blocked |
| `web/UserAgent.kt` | Turns WebView's user agent into Chrome's |
| `js-tests/` | jsdom tests for `swar.js` |
