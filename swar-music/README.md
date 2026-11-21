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
 │   • reports what's playing                   │ ◀─── │ • audio focus, wake lock     │
 │ shouldInterceptRequest → AdFilter            │ cmds │ • pause on headphones unplug │
 └──────────────────────────────────────────────┘      └──────────────────────────────┘
```

- **Background play.** YouTube Music's web player pauses when the Page Visibility API says the tab is hidden. `swar.js` runs before the page's own scripts (`WebViewCompat.addDocumentStartJavaScript`) and makes `document.hidden` always `false`. It also swallows `visibilitychange` events. The activity never calls `WebView.onPause()`, which is what would stop media. The foreground service keeps the process alive and holds a partial wake lock while music plays.
- **No ads, in three layers.**
  1. *Data:* `JSON.parse`, `Response.json()` and the embedded `ytInitialPlayerResponse` are wrapped so `adPlacements`, `playerAds`, `adSlots` and ad renderers are removed before the player reads them. With no ad scheduled, nothing plays. This is the same approach uBlock Origin uses.
  2. *Network:* `AdFilter` returns an empty response for ad servers (DoubleClick, AdSense, IMA SDK) and YouTube's ad endpoints (`/pagead/`, `/api/stats/ads`, `/ptracking`, …). Service-worker requests go through the same filter.
  3. *Fallback:* if an ad still starts, it's muted, jumped to its end, and Skip is clicked. Premium upsell banners are hidden with CSS. The "Are you still there?" dialog is dismissed automatically.
- **Controls.** The page reports title, artist, album art, position and play state over a `WebMessageListener` bridge (origin-locked to `https://music.youtube.com`). `PlaybackService` mirrors that into a `MediaSession`. Commands go back as JavaScript, and the page's own media-session handlers are called first so the queue logic stays YouTube's.
- **Audio focus.** Swar pauses for calls and navigation prompts and resumes afterwards. It pauses for good when another music app starts. It also pauses when headphones are unplugged.
- **Links.** Sign-in stays inside the app. `intent://` "open in the YouTube Music app" links are blocked. Other sites open in your browser. Shared `music.youtube.com` links can be opened with Swar.

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
| `playback/PlaybackService.kt` | Foreground service, notification, MediaSession, audio focus, locks |
| `playback/PlayerBridge.kt` | Shared state flow and command channel between the activity and the service |
| `web/AdFilter.kt` | Ad hosts and YouTube ad endpoints blocked at the network level |
| `web/NavPolicy.kt` | Which links stay in the app, open outside or are blocked |
| `web/UserAgent.kt` | Turns WebView's user agent into Chrome's |
| `js-tests/` | jsdom tests for `swar.js` |
