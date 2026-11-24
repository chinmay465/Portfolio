#!/usr/bin/env bash
# Inspects the built APK and fails if it gains anything that could track
# users or let other apps reach in:
#   - a permission outside the expected set
#   - an exported component other apps can call without a system-only permission
#   - backups or cleartext HTTP turned on
#   - code from a known analytics / ads / crash-reporting SDK
#   - a network endpoint in Swar's own code that isn't on the allowlist
#   - a JavaScript bridge into a WebView (the only WebView is Google's sign-in page)
#   - WebView's own metrics upload or Safe Browsing lookups turned back on
# Run from swar-music/ after ./gradlew assembleDebug.
set -euo pipefail

APK=${1:-app/build/outputs/apk/debug/app-debug.apk}
SDK=${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}
APKANALYZER=$(ls "$SDK"/cmdline-tools/*/bin/apkanalyzer 2>/dev/null | sort -V | tail -1)
[ -x "$APKANALYZER" ] || { echo "::error::apkanalyzer not found under $SDK"; exit 1; }

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
"$APKANALYZER" manifest print "$APK" > "$WORK/manifest.xml"
unzip -q -o "$APK" 'classes*.dex' -d "$WORK/dex"
cat "$WORK"/dex/classes*.dex | strings -n 6 > "$WORK/dex-strings.txt"

python3 - "$WORK" <<'PY'
import os, re, sys
import xml.etree.ElementTree as ET

work = sys.argv[1]
A = "{http://schemas.android.com/apk/res/android}"
root = ET.parse(os.path.join(work, "manifest.xml")).getroot()
pkg = root.get("package")
errors, report = [], []

# 1. Permissions
expected = {
    "android.permission.INTERNET",
    "android.permission.ACCESS_NETWORK_STATE",  # auto-retry when back online
    "android.permission.FOREGROUND_SERVICE",
    "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
    "android.permission.POST_NOTIFICATIONS",
    "android.permission.WAKE_LOCK",
    f"{pkg}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION",  # added by androidx.core, signature-only
}
perms = {p.get(A + "name") for p in root.iter("uses-permission")}
perms |= {p.get(A + "name") for p in root.iter("uses-permission-sdk-23")}
extra = sorted(perms - expected)
if extra:
    errors.append("Unexpected permissions: " + ", ".join(extra))
report.append("permissions=" + ",".join(sorted(p.rsplit(".", 1)[-1] for p in perms)))

# 2. Application flags
app = root.find("application")
if app.get(A + "allowBackup") != "false":
    errors.append("allowBackup is not false")
if app.get(A + "usesCleartextTraffic") == "true":
    errors.append("usesCleartextTraffic is true")
meta = {m.get(A + "name"): m.get(A + "value") for m in app.iter("meta-data")}
if meta.get("android.webkit.WebView.MetricsOptOut") != "true":
    errors.append("WebView metrics opt-out (android.webkit.WebView.MetricsOptOut) is not set")
if meta.get("android.webkit.WebView.EnableSafeBrowsing") != "false":
    errors.append("WebView Safe Browsing lookups are not turned off")
if app.get(A + "debuggable") == "true":
    report.append("debuggable=true(debug build)")

# 3. Exported components
# Permissions that only the system/shell hold, so other apps can't use the entry point.
system_only = {"android.permission.DUMP"}
# The main screen: the launcher icon plus "Open with Swar" for music.youtube.com
# links. Like any launcher icon, other apps can start it; the only input it
# takes is an https://music.youtube.com link, which it checks.
# The playback service is Media3's media session entry point: the system,
# lock screen, Bluetooth and headsets connect to it to show and control
# what's playing. It only offers transport controls (play, pause, skip, seek).
launchers = {f"{pkg}.MainActivity", f"{pkg}.playback.PlaybackService"}
exported = []
for kind in ("activity", "activity-alias", "service", "receiver", "provider"):
    for c in app.iter(kind):
        name = c.get(A + "name")
        flag = c.get(A + "exported")
        is_exported = flag == "true" or (flag is None and c.find("intent-filter") is not None)
        if not is_exported:
            continue
        perm = c.get(A + "permission") or c.get(A + "readPermission")
        exported.append(f"{kind}:{name.rsplit('.', 1)[-1]}[{perm or 'open'}]")
        if name in launchers or perm in system_only:
            continue
        errors.append(f"Exported {kind} reachable by other apps: {name} (permission={perm})")
report.append("exported=" + ",".join(exported))

# 4. Tracking / analytics / ads SDKs anywhere in the dex (including transitive deps)
strings = open(os.path.join(work, "dex-strings.txt"), errors="replace").read()
trackers = {
    "Firebase": "Lcom/google/firebase/", "Google Play services": "Lcom/google/android/gms/",
    "Crashlytics": "Lcom/crashlytics/", "Facebook SDK": "Lcom/facebook/",
    "AppsFlyer": "Lcom/appsflyer/", "Adjust": "Lcom/adjust/sdk/", "Branch": "Lio/branch/",
    "Amplitude": "Lcom/amplitude/", "Mixpanel": "Lcom/mixpanel/", "Segment": "Lcom/segment/",
    "Sentry": "Lio/sentry/", "Bugsnag": "Lcom/bugsnag/", "OneSignal": "Lcom/onesignal/",
    "Flurry": "Lcom/flurry/", "App Center": "Lcom/microsoft/appcenter/",
    "Datadog": "Lcom/datadog/", "New Relic": "Lcom/newrelic/", "AdMob/Ads": "Lcom/google/android/gms/ads/",
    "AppLovin": "Lcom/applovin/", "Unity Ads": "Lcom/unity3d/ads/",
}
found = [n for n, d in trackers.items() if d in strings]
if found:
    errors.append("Tracking/third-party SDK code found: " + ", ".join(found))
report.append("trackerSDKs=" + (",".join(found) or "none"))

# 5. Network endpoints written in Swar's own source code
allowed_urls = {
    "https://music.youtube.com",              # InnerTube.ORIGIN
    "https://music.youtube.com/youtubei/v1/",  # YouTube Music's own API
    "https://www.youtube.com/watch?v=$videoId",  # what NewPipe Extractor looks streams up for
    "https://www.youtube.com", "https://www.youtube.com/",  # Origin/Referer NewPipe sends for web streams
    "https://accounts.google.com/ServiceLogin?ltmpl=music&service=youtube&passive=true",  # Google sign-in page
}
src_urls = set()
for d, _, files in os.walk("app/src/main/java"):
    for f in files:
        src_urls |= set(re.findall(r'"((?:https?|wss?)://[^"\s]+)"', open(os.path.join(d, f)).read()))
unknown = sorted(src_urls - allowed_urls)
if unknown:
    errors.append("Unreviewed network endpoints in source: " + ", ".join(unknown))
report.append("endpoints=" + ",".join(sorted(src_urls)))
if any("http://" in u for u in src_urls):
    errors.append("Plaintext http:// endpoint in source")

# 6. The only WebView is Google's sign-in page. No page gets a way to call
# into the app.
for d, _, files in os.walk("app/src/main/java"):
    for f in files:
        text = open(os.path.join(d, f)).read()
        for api in ("addJavascriptInterface", "addWebMessageListener", "addDocumentStartJavaScript", "evaluateJavascript"):
            if api in text:
                errors.append(f"{f} uses {api}: no page may script into Swar")
report.append("webviewBridges=none")

# Listening sockets would let other apps on the device or network connect in.
for d, _, files in os.walk("app/src/main/java"):
    for f in files:
        text = open(os.path.join(d, f)).read()
        if re.search(r"\b(ServerSocket|LocalServerSocket|DatagramSocket\s*\(\s*\d)", text):
            errors.append(f"Listening socket in {f}")

print("::notice title=Swar privacy check::" + " | ".join(report))
for e in errors:
    print("::error title=Swar privacy check::" + e)
sys.exit(1 if errors else 0)
PY
echo "Privacy check passed."
