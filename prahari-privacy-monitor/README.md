# Prahari

**प्रहरी — the sentinel.** An Android app that watches your phone for as long as it's on and tells you which app used which permission, when, and whether you were using that app at the time. It also shows who can see what you type, which apps log your input, which tracking servers each app calls and how much each one uploads in the background.

Everything stays on the phone: no account, no analytics, no server. Kotlin + Jetpack Compose, Android 10+.

## What it catches

| Scenario | How Prahari sees it | Needs |
| --- | --- | --- |
| An app turns on the **camera** | `CameraManager.AvailabilityCallback`; flashlight blips filtered out | nothing |
| An app records from the **microphone** | `AudioManager.AudioRecordingCallback`, with the audio source (call, voice recognition, hotword…) and whether Android silenced it | nothing |
| An app switches on **GPS** | `GnssStatus.Callback` (Prahari never asks for a fix itself) | location permission |
| **Which app** did it, and was it in the background | the app on screen, else apps running a foreground service that hold the permission (Android 11+ only lets those reach the camera/mic) | usage access |
| **Exact app and time** for camera, mic, location, **clipboard**, contacts, SMS, call log, calendar, sensors, media, nearby devices | Android's own access record (`AppOpsManager.getPackagesForOps`), the one behind the privacy dashboard | precision mode (adb) |
| Apps that **see every key you type** | enabled and current keyboards, accessibility services that read windows or filter keys, autofill, notification listeners, assistant, device admins | nothing |
| Apps that **record your screen and taps** | session-replay SDKs (UXCam, Smartlook, FullStory, Clarity, UserExperior, Sentry/Datadog replay…) found in each APK's dex | nothing |
| Apps that **write what you type to the log** to send later | canary test: type a made-up word into the app, Prahari searches the shared log for it | log access (adb) |
| Apps that **phone home** | DNS watch: a local DNS-only VPN that attributes every lookup to its app (`getConnectionOwnerUid`) and flags ~100 analytics, attribution, ads, replay and fingerprinting domains | DNS watch on |
| Apps that **upload in the background** | Android's network accounting, split into foreground and background bytes, against minutes on screen | usage access |
| What's **built into** each app | ~110 tracker SDKs across session replay, location data, fingerprinting, attribution, ads, marketing, analytics and crash reporting | nothing |

Each app gets a 0–100 score with the reasons behind it. What an app did (background camera use, clipboard reads, background uploads, tracker servers) weighs more than what it's allowed to do.

### What no app can see

The contents of what an app sends. Searches and messages leave the phone over HTTPS, and Android 7+ apps ignore user-installed certificates, so reading them needs root. Prahari covers everything around that: who receives your keystrokes, who logs them, who records the screen, who they call and how much they send.

## Battery

- One foreground service, silent and hidden from the status bar, holding three callbacks. It sleeps until Android reports a change.
- No wake locks, no alarms, no location requests, no polling while the screen is off.
- Precision mode reads the access record when the screen turns on or off, every 15 minutes while it's on, and 3 s after a camera/mic event.
- Tracker scans read each APK once per version: when you open Apps, a minute after an install or update (battery not low), and a daily catch-up only while charging.
- DNS watch blocks in `poll()` until a query arrives and writes to the database in batches.
- Setup shows Prahari's own CPU time since it started.

## Setup

1. **Usage access** (Settings → Usage access → Prahari). Without it Prahari still sees camera/mic/GPS use but can't name the app.
2. **Notifications**, for alerts.
3. **Location**, for GPS watch.
4. Optional, from a computer with USB debugging on:

   ```sh
   adb shell pm grant com.chinmay.prahari android.permission.GET_APP_OPS_STATS   # precision mode
   adb shell pm grant com.chinmay.prahari android.permission.READ_LOGS           # canary test
   ```

5. Optional: **DNS watch** in Setup. Android allows one VPN at a time, so it can't run alongside Kavach or a work VPN.

On Samsung, Xiaomi and OnePlus, set Prahari's battery use to Unrestricted so it isn't put to sleep.

## Build

```sh
./gradlew testDebugUnitTest assembleDebug
bash scripts/privacy-check.sh
```

CI builds the debug APK as the `prahari-debug-apk` artifact. The privacy check fails the build if Prahari gains a permission outside its list (it must never hold camera, mic, contacts, SMS or background location), an exported component, backups, cleartext HTTP, a tracker SDK, an unreviewed endpoint or a listening socket.

## Code

| Path | What |
| --- | --- |
| `watch/WatchService.kt` | the watcher: camera, mic and GPS callbacks, sessions, alerts, precision polling |
| `watch/UsageTracker.kt` | foreground app and foreground services from usage events, read incrementally |
| `watch/OpsReader.kt` | precision mode: Android's access record via `HiddenApiBypass` |
| `core/Attribution.kt` | which app to blame when Android only says "camera in use" |
| `core/Risk.kt` | the score and its reasons |
| `apps/Inventory.kt` | installed apps, granted permissions, keyboards, accessibility, notification listeners, autofill |
| `apps/DexTypes.kt`, `apps/TrackerSdks.kt` | reads class names from dex files and matches tracker SDKs |
| `net/DnsWatchService.kt`, `net/DnsTunnel.kt` | DNS-only VPN with per-app attribution, DoH upstream |
| `net/NetUsage.kt` | per-app foreground/background data use |
| `canary/` | canary word and logcat search |
| `ui/` | Compose screens: Live, Apps, App detail, Network, Typing, Setup |
