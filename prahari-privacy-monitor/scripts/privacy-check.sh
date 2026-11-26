#!/usr/bin/env bash
# Inspects the built APK and fails if Prahari gains anything that could leak
# what it records or let other apps reach in:
#   - a permission outside the expected set
#   - an exported component other than the launcher screen
#   - backups or cleartext HTTP turned on
#   - code from a known analytics / ads / crash-reporting SDK (classes that are
#     actually defined in the APK, not the SDK names Prahari looks for)
#   - a network endpoint in Prahari's own code that isn't on the allowlist
#   - a listening socket
# Run from prahari-privacy-monitor/ after ./gradlew assembleDebug.
set -euo pipefail

APK=${1:-app/build/outputs/apk/debug/app-debug.apk}
SDK=${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}
APKANALYZER=$(ls "$SDK"/cmdline-tools/*/bin/apkanalyzer 2>/dev/null | sort -V | tail -1)
[ -x "$APKANALYZER" ] || { echo "::error::apkanalyzer not found under $SDK"; exit 1; }

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
"$APKANALYZER" manifest print "$APK" > "$WORK/manifest.xml"
"$APKANALYZER" dex packages --defined-only "$APK" > "$WORK/packages.txt"

python3 - "$WORK" <<'PY'
import os, re, sys
import xml.etree.ElementTree as ET

work = sys.argv[1]
A = "{http://schemas.android.com/apk/res/android}"
root = ET.parse(os.path.join(work, "manifest.xml")).getroot()
pkg = root.get("package")
errors, report = [], []

# 1. Permissions. The last two are development permissions you can only grant
# over adb; nothing in the app can obtain them by itself.
expected = {
    "android.permission.FOREGROUND_SERVICE",
    "android.permission.FOREGROUND_SERVICE_SPECIAL_USE",
    "android.permission.FOREGROUND_SERVICE_LOCATION",
    "android.permission.POST_NOTIFICATIONS",
    "android.permission.RECEIVE_BOOT_COMPLETED",
    "android.permission.QUERY_ALL_PACKAGES",
    "android.permission.PACKAGE_USAGE_STATS",
    "android.permission.ACCESS_COARSE_LOCATION",
    "android.permission.ACCESS_FINE_LOCATION",
    "android.permission.INTERNET",
    "android.permission.GET_APP_OPS_STATS",
    "android.permission.READ_LOGS",
    f"{pkg}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION",  # added by androidx.core, signature-only
}
perms = {p.get(A + "name") for p in root.iter("uses-permission")}
perms |= {p.get(A + "name") for p in root.iter("uses-permission-sdk-23")}
extra = sorted(perms - expected)
if extra:
    errors.append("Unexpected permissions: " + ", ".join(extra))
for never in ("CAMERA", "RECORD_AUDIO", "READ_CONTACTS", "READ_SMS", "ACCESS_BACKGROUND_LOCATION"):
    if f"android.permission.{never}" in perms:
        errors.append(f"Prahari must never hold {never}")
report.append("permissions=" + ",".join(sorted(p.rsplit(".", 1)[-1] for p in perms)))

# 2. Application flags
app = root.find("application")
if app.get(A + "allowBackup") != "false":
    errors.append("allowBackup is not false")
if app.get(A + "usesCleartextTraffic") == "true":
    errors.append("usesCleartextTraffic is true")

# 3. Exported components
system_only = {"android.permission.BIND_VPN_SERVICE", "android.permission.BIND_JOB_SERVICE", "android.permission.DUMP"}
launchers = {f"{pkg}.MainActivity"}
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
        # androidx's ProfileInstaller receiver only accepts the DUMP permission.
        if name.startswith("androidx.profileinstaller.") and perm == "android.permission.DUMP":
            continue
        errors.append(f"Exported {kind} reachable by other apps: {name} (permission={perm})")
report.append("exported=" + ",".join(exported))

# 4. Tracking / analytics / ads SDK classes defined in the APK
defined = set()
for line in open(os.path.join(work, "packages.txt"), errors="replace"):
    parts = line.split()
    if parts:
        defined.add(parts[-1])
trackers = {
    "Firebase": "com.google.firebase", "Google Play services": "com.google.android.gms",
    "Crashlytics": "com.crashlytics", "Facebook SDK": "com.facebook",
    "AppsFlyer": "com.appsflyer", "Adjust": "com.adjust.sdk", "Branch": "io.branch",
    "Amplitude": "com.amplitude", "Mixpanel": "com.mixpanel", "Segment": "com.segment",
    "Sentry": "io.sentry", "Bugsnag": "com.bugsnag", "OneSignal": "com.onesignal",
    "Flurry": "com.flurry", "App Center": "com.microsoft.appcenter", "Datadog": "com.datadog",
    "New Relic": "com.newrelic", "AppLovin": "com.applovin", "Unity Ads": "com.unity3d",
    "CleverTap": "com.clevertap", "MoEngage": "com.moengage", "UXCam": "com.uxcam",
}
found = sorted(n for n, p in trackers.items() if any(d == p or d.startswith(p + ".") for d in defined))
if found:
    errors.append("Tracking/third-party SDK code found: " + ", ".join(found))
report.append("trackerSDKs=" + (",".join(found) or "none"))

# 5. Network endpoints written in Prahari's own source code
allowed_urls = {
    "https://1.1.1.1/dns-query",
    "https://1.0.0.1/dns-query",
    "https://dns.quad9.net/dns-query",
}
src_urls = set()
for d, _, files in os.walk("app/src/main/java"):
    for f in files:
        text = open(os.path.join(d, f)).read()
        src_urls |= set(re.findall(r'"((?:https?|wss?)://[^"\s]+)"', text))
        if re.search(r"\b(ServerSocket|LocalServerSocket|DatagramSocket\s*\(\s*\d)", text):
            errors.append(f"Listening socket in {f}")
unknown = sorted(src_urls - allowed_urls)
if unknown:
    errors.append("Unreviewed network endpoints in source: " + ", ".join(unknown))
report.append("endpoints=" + ",".join(sorted(src_urls)))

print("::notice title=Prahari privacy check::" + " | ".join(report))
for e in errors:
    print("::error title=Prahari privacy check::" + e)
sys.exit(1 if errors else 0)
PY
echo "Privacy check passed."
