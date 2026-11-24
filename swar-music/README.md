# Swar: a YouTube Music player of its own

Swar is a native Android music player for YouTube Music. Home, Search, Library, album, artist and playlist pages and the player are all Swar's own screens. Android's media player (Media3 ExoPlayer) plays the audio directly, so there's no web page, no ads and no video. Music keeps playing with the screen off or another app open, and the notification, lock screen, headset and Bluetooth buttons control it. Sign in with your Google account and your Home, liked songs, playlists, albums and history come with you.

## How it works

```
 ┌───────────── Swar's screens (Jetpack Compose) ─────────────┐
 │ Home · Search · Library · Album / Artist / Playlist pages   │
 │ Mini player ⇅ Full player · Up next · Audio quality         │
 └──────────────┬───────────────────────────────┬─────────────┘
                │ YtMusic (InnerTube, WEB_REMIX) │ SwarPlayer
                ▼                               ▼
   music.youtube.com/youtubei/v1      PlaybackService (Media3 session)
   browse · search · next · like        ExoPlayer ← Streams (NewPipe Extractor)
   (signed in: session cookie +         audio cache on disk
    SAPISIDHASH)                         notification · lock screen · headset
```

- **Pages and search.** `data/InnerTube.kt` sends the same requests music.youtube.com's web player sends (client `WEB_REMIX`, always in English so text parses the same everywhere). `data/Parser.kt` looks for the renderers YouTube Music has used for years (shelves, carousels, list rows, cards, the Up next panel) wherever they appear in a response, rather than one exact path per screen, so small layout changes don't break whole screens.
- **Playback.** Every queued song is `swar://song/<videoId>`. When ExoPlayer reads it, `playback/Streams.kt` asks NewPipe Extractor for the song's audio streams (the engine NewPipe uses, which keeps up with YouTube's changes) and fetches the chosen one the way NewPipe's own player does. Played audio is cached on disk (up to 512 MB), so replays and seeking back cost nothing. Expired or refused stream URLs are looked up again automatically.
- **Songs, not videos.** YouTube Music's Up next links a music video to its song version. Swar always plays the song version when there is one, including for a video you tap in search.
- **Up next.** Tapping a song starts its radio (YouTube Music's own "what plays next"). Albums and playlists play in order. Near the end of the queue, Swar fetches the next part of the radio or the rest of a long playlist.
- **Account.** Signing in happens once, on Google's own page in a WebView (`ui/LoginActivity.kt`). Swar keeps the `music.youtube.com` session cookie in its private storage and signs requests with it, the way the web player does. Updating from Swar 1.x carries the old sign-in over.

## App experience

- **Home:** your YouTube Music Home with mood chips (Relax, Workout…), quick picks and carousels. Pull to refresh, and it keeps loading as you scroll.
- **Search:** suggestions as you type, recent searches, and All / Songs / Videos / Albums / Artists / Playlists filters.
- **Pages:** albums with numbered tracks, playlists (long ones load as you scroll), artists with their songs, albums, singles and Radio / Shuffle.
- **Player:** the mini player sits above the tabs. Tap it or swipe it up to open the full player, and swipe the full player down (it follows your finger), tap the arrow or press Back to close it. The backdrop glows in the colours of the album art. It has seek, shuffle, repeat, like (signed in), Up next (tap to jump, remove songs) and an audio quality chip that shows the codec and bitrate playing.
- **Long-press anything:** play next, add to queue, start radio, go to the album or artist.
- **Audio quality:** Auto (High on Wi-Fi, Normal on mobile data), High, Normal or Low. Free accounts top out at about 128 kbps; 256 kbps is a Premium perk.
- **Look:** deep-space backdrop with aurora glows, glass bars and cards with gradient edges, a cyan-to-violet accent. No blur or other effects that cost frames while scrolling.
- **Remembers:** the queue and position survive closing the app.

## Privacy

- **Nothing from Swar.** No analytics, crash-reporting or ad SDKs and no server of its own. Swar talks only to YouTube Music's API, YouTube's stream servers and Google's image servers, plus Google's sign-in page once.
- **No YouTube telemetry.** Swar doesn't send YouTube's playback-stats or event-log requests at all. That also means YouTube Music doesn't see what you play in Swar, so its recommendations don't learn from it.
- **Sign-in stays on the phone.** The session cookie is in the app's private storage; backups and phone-to-phone transfers are off. The sign-in WebView uploads no metrics and makes no Safe Browsing lookups, and no page can script into the app.

CI enforces this on every build: `scripts/privacy-check.sh` fails if the APK gains a permission, an exported component, a tracking SDK, an unreviewed network endpoint in Swar's own code, or a JavaScript bridge into a WebView.

## Using it

1. Install the APK and open Swar. Allow notifications (Android 13+): the playback notification is what keeps music alive in the background.
2. Home works signed out. For your own Home and Library, open **Library → Sign in**.
3. Play something, then lock the phone. Use the notification or lock screen to pause or skip.
4. Swiping Swar out of recents stops the music.

## Known limits

- **YouTube changes.** When YouTube changes its stream format, updating NewPipe Extractor (`app/build.gradle.kts`) is usually the fix. When YouTube Music changes a page layout, `data/Parser.kt` is where to look.
- **Google sign-in.** Google refuses sign-in from some embedded browsers. Swar's sign-in page presents itself as Chrome, which is usually enough; if Google still refuses, everything except Library and likes works signed out.
- **No downloads.** Keeping songs offline is a YouTube Music Premium feature; Swar only caches what you've played.
- **Terms of Service.** A third-party client that plays YouTube audio without ads breaks YouTube's Terms of Service. Swar is for personal use and sideloading, not for the Play Store.
- **License.** NewPipe Extractor is GPLv3, so APKs built with it fall under GPLv3, even though the rest of this repository is MIT.

## Build

Requirements: Android Studio (Ladybug or newer) or JDK 17 + Android SDK 35.

```bash
./gradlew assembleDebug        # APK → app/build/outputs/apk/debug/app-debug.apk
./gradlew testDebugUnitTest    # parser, sign-in hash, audio quality, user agent
```

**From GitHub instead of a PC:** the repo's CI (`.github/workflows/ci.yml`, job `swar`) runs the tests, builds the APK and runs the privacy check on every push and PR. Download `swar-debug-apk` from the run's **Artifacts** section and install `app-debug.apk`.

## Project layout

| File | Role |
|---|---|
| `data/InnerTube.kt` | YouTube Music's web API: browse, search, next, suggestions, like, account |
| `data/Parser.kt`, `data/Json.kt` | Responses → songs, albums, artists, playlists, sections, headers, queues |
| `data/Models.kt` | The app's data types |
| `data/Account.kt`, `data/Auth.kt` | The signed-in session and its SAPISIDHASH request signature |
| `data/YtMusic.kt` | Everything the screens ask YouTube Music for; search filters and Library shelves |
| `playback/Streams.kt` | NewPipe Extractor setup, stream choice, ExoPlayer data source and disk cache |
| `playback/AudioQuality.kt` | Auto / High / Normal / Low and which stream each picks |
| `playback/PlaybackService.kt` | Media3 session service: ExoPlayer, notification, lock screen, headset |
| `playback/SwarPlayer.kt` | Queue, radio continuation, controls, likes, the remembered queue |
| `ui/SwarRoot.kt` | Tabs, navigation, the mini ⇅ full player gesture, shared links |
| `ui/screens/` | Home, Search, Browse (album/artist/playlist), Library, Settings and their state |
| `ui/player/Player.kt` | Mini player, full player, Up next and quality sheets |
| `ui/Components.kt`, `ui/ItemMenu.kt`, `ui/theme/Theme.kt` | Rows, cards, sections, long-press menu, colours and the aurora backdrop |
| `ui/LoginActivity.kt`, `web/UserAgent.kt` | One-time Google sign-in |
| `CrashLog.kt` | Saves a crash report on the phone and shows it on next launch |
