#!/usr/bin/env bash
# Emulator end-to-end check, run by .github/workflows/prahari-e2e.yml.
# Installs Prahari, grants what a user would (usage access, notifications,
# location, and the two adb-only grants), opens the camera app, and checks
# that Prahari recorded a camera use against that app. Saves screenshots of
# every tab to e2e-out/.
set -euo pipefail

PKG=com.chinmay.prahari
APK=app/build/outputs/apk/debug/app-debug.apk
OUT=e2e-out
mkdir -p "$OUT"

fail() { echo "::error title=Prahari e2e::$1"; exit 1; }

# Always print what happened: crashes, Prahari's own state log lines, the camera
# service's client history, and small screenshots (base64 JPEG) for review.
diagnostics() {
  set +e
  echo "::group::crash buffer"; adb logcat -d -b crash; echo "::endgroup::"
  echo "::group::Prahari log"; adb logcat -d -s PrahariWatch PrahariOps AndroidRuntime; echo "::endgroup::"
  echo "::group::usage events"; adb shell dumpsys usagestats | grep -E "ACTIVITY_RESUMED|FOREGROUND_SERVICE_START" | tail -12; adb shell cmd package query-activities -a android.intent.action.MAIN -c android.intent.category.HOME | grep -i "packageName" | head; echo "::endgroup::"
  echo "::group::camera service"; adb shell dumpsys media.camera | grep -iE "client|event|connect|disconnect|status" | tail -60; echo "::endgroup::"
  echo "::group::Prahari notification"; grep -A12 "pkg=$PKG" "$OUT/notifications.txt" 2>/dev/null | head -40; echo "::endgroup::"
  pip install --quiet pillow > /dev/null 2>&1
  for f in "$OUT"/*.png; do
    [ -f "$f" ] || continue
    echo "::group::screenshot $(basename "$f")"
    python3 -c "import sys,io,base64; from PIL import Image; im=Image.open(sys.argv[1]).convert('RGB'); im.thumbnail((360,800)); b=io.BytesIO(); im.save(b,'JPEG',quality=55); print('B64:'+base64.b64encode(b.getvalue()).decode())" "$f"
    echo "::endgroup::"
  done
}
trap diagnostics EXIT
shot() { adb exec-out screencap -p > "$OUT/$1.png"; }
tap_text() {
  adb shell uiautomator dump /sdcard/ui.xml > /dev/null
  adb exec-out cat /sdcard/ui.xml > "$OUT/ui.xml"
  python3 - "$1" "$OUT/ui.xml" "${2:-0}" <<'PY'
import re, subprocess, sys
label, path, nth = sys.argv[1], sys.argv[2], int(sys.argv[3])
xml = open(path, errors="replace").read()
for m in re.finditer(r'<node [^>]*>', xml):
    node = m.group(0)
    text = re.search(r' text="([^"]*)"', node)
    desc = re.search(r' content-desc="([^"]*)"', node)
    if (text and text.group(1) == label) or (desc and desc.group(1) == label):
        if nth > 0:
            nth -= 1
            continue
        x1, y1, x2, y2 = map(int, re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', node).groups())
        subprocess.run(["adb", "shell", "input", "tap", str((x1 + x2) // 2), str((y1 + y2) // 2)], check=True)
        sys.exit(0)
print(f"no node with text {label!r}")
sys.exit(1)
PY
}

adb wait-for-device
# Not `install -g`: that would also grant the adb-only precision permissions.
adb install -r "$APK"
for p in POST_NOTIFICATIONS ACCESS_FINE_LOCATION ACCESS_COARSE_LOCATION; do
  adb shell pm grant "$PKG" "android.permission.$p"
done
adb shell appops set "$PKG" GET_USAGE_STATS allow
# Precision mode is granted later: the first check covers the plain setup.
adb logcat -c

adb shell am start -W -n "$PKG/.MainActivity"
sleep 8
shot 01-live-idle
adb shell dumpsys activity services "$PKG" > "$OUT/services.txt"
grep -q "WatchService" "$OUT/services.txt" || fail "WatchService is not running"

# Open the camera app the way a user would.
CAM=$(adb shell cmd package resolve-activity --brief -a android.media.action.STILL_IMAGE_CAMERA | tail -1 | cut -d/ -f1 | tr -d '\r')
echo "camera app: $CAM"
for p in CAMERA RECORD_AUDIO ACCESS_FINE_LOCATION ACCESS_COARSE_LOCATION; do
  adb shell pm grant "$CAM" "android.permission.$p" 2> /dev/null || true
done
adb shell am start -W -a android.media.action.STILL_IMAGE_CAMERA
sleep 5
# First run of the camera app asks about photo locations before it keeps the camera open.
tap_text "NEXT" || true
sleep 10
shot 02-camera-open
adb shell dumpsys notification --noredact > "$OUT/notifications.txt"
adb shell input keyevent KEYCODE_HOME
sleep 4

sleep 12  # let the late re-attribution of brief uses run

# Read Prahari's database (debug build, so run-as works).
pull_db() {
  for f in prahari.db prahari.db-wal prahari.db-shm; do
    adb exec-out run-as "$PKG" cat "databases/$f" > "$OUT/$f" 2> /dev/null || rm -f "$OUT/$f"
  done
}
pull_db
python3 - "$OUT/prahari.db" "$CAM" <<'PY'
import sqlite3, sys
db, cam = sys.argv[1], sys.argv[2]
rows = sqlite3.connect(db).execute("SELECT kind, pkg, candidates, background, source, detail, start, end_ts FROM access ORDER BY start").fetchall()
for r in rows:
    print(r)
camera = [r for r in rows if r[0] == "camera"]
def err(m):
    print("::error title=Prahari e2e::" + m); sys.exit(1)
if not camera: err("no camera use recorded")
if any(r[4] != "LIVE" for r in rows): err("precision rows without precision mode")
if not all(r[1] == cam for r in camera): err(f"camera use not attributed to {cam} from usage events alone")
if any(r[3] for r in camera): err("camera app was on screen but the use is marked background")
if not all(r[7] is not None for r in camera): err("camera session still open after the camera closed")
print(f"camera use attributed to {cam}, on screen, without precision mode: ok")
PY

# Precision mode: grant over adb, turn the screen off and on (Prahari reads
# Android's access record then), and expect exact rows.
adb shell pm grant "$PKG" android.permission.GET_APP_OPS_STATS
adb shell pm grant "$PKG" android.permission.READ_LOGS
adb shell input keyevent KEYCODE_SLEEP
sleep 3
adb shell input keyevent KEYCODE_WAKEUP
sleep 2
adb shell wm dismiss-keyguard || true
sleep 6
pull_db
python3 - "$OUT/prahari.db" "$CAM" <<'PY'
import sqlite3, sys
db, cam = sys.argv[1], sys.argv[2]
rows = sqlite3.connect(db).execute("SELECT kind, pkg, source FROM access WHERE source = 'OPS'").fetchall()
print(f"{len(rows)} rows from Android's access record, kinds: {sorted({r[0] for r in rows})}")
if not rows:
    print("::error title=Prahari e2e::precision mode recorded nothing"); sys.exit(1)
dup = [r for r in rows if r[0] == "camera" and r[1] == cam]
if dup:
    print("::error title=Prahari e2e::camera use recorded twice (live and access record)"); sys.exit(1)
PY

# Every screen renders without crashing.
adb shell am start -W -n "$PKG/.MainActivity"
sleep 4
shot 03-live-timeline
tap_text "Apps"
sleep 25
shot 04-apps
tap_text "Network"
sleep 6
shot 05-network
tap_text "Typing"
sleep 6
shot 06-typing
tap_text "Setup"
sleep 4
shot 07-setup
tap_text "Live"
sleep 3
# The timeline row for the camera use (before it: the status tile and the filter chip).
tap_text "Camera" 2 || true
sleep 4
shot 08-app-detail

# DNS watch must never cost the phone its DNS: lookups resolve with it on, and
# still resolve when every DoH server is blocked (fallback to the network's DNS).
adb shell appops set "$PKG" ACTIVATE_VPN allow
tap_text "Setup"
sleep 3
for i in 1 2 3 4 5; do
  tap_text "DNS watch" && break
  adb shell input swipe 500 1600 500 600 300
  sleep 1
done
sleep 5
shot 09-dns-watch
adb shell dumpsys activity services "$PKG" | grep -q "DnsWatchService" || fail "DNS watch did not start"
resolves() { adb shell ping -c 1 -W 3 "$1" 2>&1 | tee -a "$OUT/ping.txt" | grep -q "^PING "; }
resolves example.com || fail "DNS broken with DNS watch on"
resolves www.wikipedia.org || fail "DNS broken with DNS watch on"
adb root > /dev/null && sleep 3 && adb wait-for-device
for ip in 1.1.1.1 1.0.0.1 9.9.9.9 149.112.112.112; do
  adb shell iptables -I OUTPUT -d "$ip" -p tcp --dport 443 -j REJECT --reject-with tcp-reset
done
resolves www.mozilla.org || fail "DNS broken when DoH is blocked (no fallback)"
resolves github.com || fail "DNS broken when DoH is blocked (no fallback)"
echo "DNS keeps working with DNS watch on, with and without DoH: ok"
sleep 32  # let the batch of lookups reach the database
pull_db() {
  for f in prahari.db prahari.db-wal prahari.db-shm; do
    adb exec-out run-as "$PKG" cat "databases/$f" > "$OUT/$f" 2> /dev/null || rm -f "$OUT/$f"
  done
}
pull_db
python3 - "$OUT/prahari.db" <<'PY'
import sqlite3, sys
rows = sqlite3.connect(sys.argv[1]).execute("SELECT pkg, domain, count FROM dns").fetchall()
for r in rows[:20]:
    print(r)
names = {r[1] for r in rows}
if "example.com" not in names:
    print("::error title=Prahari e2e::DNS watch recorded no lookups"); sys.exit(1)
if not names & {"www.mozilla.org", "github.com"}:
    print("::error title=Prahari e2e::lookups made while DoH was blocked did not go through the fallback"); sys.exit(1)
print("lookups recorded, including through the fallback: ok")
PY

adb logcat -d -b crash > "$OUT/crash.txt" || true
if grep -q "$PKG" "$OUT/crash.txt"; then
  cat "$OUT/crash.txt"
  fail "Prahari crashed"
fi
adb shell dumpsys activity services "$PKG" | grep -q "WatchService" || fail "WatchService died"
echo "Prahari e2e passed."
