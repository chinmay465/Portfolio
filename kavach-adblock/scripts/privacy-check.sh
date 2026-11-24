#!/usr/bin/env bash
# Inspects the built APK and fails if it gains anything that could track
# users or let other apps reach in:
#   - a permission outside the expected set
#   - an exported component other apps can call without a system-only permission
#   - backups or cleartext HTTP turned on
#   - code from a known analytics / ads / crash-reporting SDK
#   - a network endpoint in Kavach's own code that isn't on the allowlist
# Run from kavach-adblock/ after ./gradlew assembleDebug.
set -euo pipefail

APK=${1:-app/build/outputs/apk/debug/app-debug.apk}
SDK=${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}
APKANALYZER=$(ls "$SDK"/cmdline-tools/*/bin/apkanalyzer 2>/dev/null | sort -V | tail -1)
[ -x "$APKANALYZER" ] || { echo "::error::apkanalyzer not found under $SDK"; exit 1; }

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
"$APKANALYZER" manifest print "$APK" > "$WORK/manifest.xml"
unzip -q -o "$APK" 'classes*.dex' -d "$WORK/dex"
unzip -Z1 "$APK" | grep '^lib/.*\.so$' > "$WORK/native-libs.txt" || true
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
    "android.permission.FOREGROUND_SERVICE",
    "android.permission.FOREGROUND_SERVICE_SPECIAL_USE",
    "android.permission.POST_NOTIFICATIONS",
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
if app.get(A + "debuggable") == "true":
    report.append("debuggable=true(debug build)")

# 3. Exported components
# Permissions that only the system/shell hold, so other apps can't use the entry point.
system_only = {"android.permission.BIND_VPN_SERVICE", "android.permission.DUMP"}
# Launcher entries: the main screen plus the "Kavach On"/"Kavach Off" quick
# toggles used by automation apps. Like any launcher icon, other apps can start
# them; they only switch protection and take no input.
launchers = {f"{pkg}.MainActivity", f"{pkg}.KavachOnActivity", f"{pkg}.KavachOffActivity"}
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

# 4b. Native code: only the reviewed tunnel engine (hev-socks5-tunnel, MIT).
libs = [l.strip() for l in open(os.path.join(work, "native-libs.txt")) if l.strip()]
unknown_libs = sorted({l.rsplit("/", 1)[-1] for l in libs} - {"libhev-socks5-tunnel.so"})
if unknown_libs:
    errors.append("Unreviewed native libraries: " + ", ".join(unknown_libs))
if not any(l.endswith("arm64-v8a/libhev-socks5-tunnel.so") for l in libs):
    errors.append("Tunnel engine missing for arm64-v8a (run scripts/build-tunnel.sh)")
report.append("nativeLibs=" + ",".join(sorted({l.split("/")[1] for l in libs})))

# 5. Network endpoints written in Kavach's own source code
allowed_urls = {
    "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts",
    "https://1.1.1.1/dns-query",
    "https://1.0.0.1/dns-query",
    "https://dns.quad9.net/dns-query",
    # Proxy mode (off by default): Setu's pool, and the on-phone proxy tests
    # (sent through the proxy being tested, never directly).
    "https://setu-proxy-hub.onrender.com",
    "https://1.1.1.1/cdn-cgi/trace",
    "https://www.google.com/generate_204",
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

# Listening sockets would let other apps on the device or network connect in.
# One exception: proxy mode's LocalProxy, which must bind to loopback only.
for d, _, files in os.walk("app/src/main/java"):
    for f in files:
        text = open(os.path.join(d, f)).read()
        if not re.search(r"\b(ServerSocket|LocalServerSocket|DatagramSocket\s*\(\s*\d)", text):
            continue
        if f == "LocalProxy.kt":
            # Every bind() must use LOOPBACK_V4 (127.0.0.1), and no ServerSocket may bind in its constructor.
            ctor_args = [a.strip() for a in re.findall(r"ServerSocket\(([^)]*)\)", text)]
            binds = re.findall(r"\bbind\(([^\n]*)", text)
            loopback_v4 = re.search(r"LOOPBACK_V4: InetAddress = InetAddress\.getByAddress\(byteArrayOf\(127, 0, 0, 1\)\)", text)
            if (binds and loopback_v4 and all("LOOPBACK_V4" in b for b in binds)
                    and all(a == "" for a in ctor_args) and "LocalServerSocket" not in text):
                report.append("listeners=LocalProxy(loopback)")
                continue
            errors.append("LocalProxy must bind its ServerSocket to 127.0.0.1 (LOOPBACK_V4) only")
            continue
        errors.append(f"Listening socket in {f}")

print("::notice title=Kavach privacy check::" + " | ".join(report))
for e in errors:
    print("::error title=Kavach privacy check::" + e)
sys.exit(1 if errors else 0)
PY
echo "Privacy check passed."
