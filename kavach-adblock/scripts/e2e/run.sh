#!/usr/bin/env bash
# Emulator test for proxy mode's full tunnel. Expects connect-proxy.py on the
# host at port 3128 (the emulator reaches the host as 10.0.2.2) logging to
# $PROXY_LOG. Checks that a plain command-line client, which knows nothing
# about proxies, has its traffic routed through Kavach and the proxy, and
# that blocklisted hosts are stopped.
set -uo pipefail
PKG=com.chinmay.kavach
APK=app/build/outputs/apk/debug/app-debug.apk
PROXY_LOG=${PROXY_LOG:-/tmp/proxy.log}
fail() { echo "::error::$1"; dump; exit 1; }
dump() {
  echo "--- proxy log"; cat "$PROXY_LOG"
  echo "--- logcat"; adb logcat -d | grep -iE "kavach|hev|AndroidRuntime|vpn" | tail -150
  echo "--- connectivity"; adb shell dumpsys connectivity | grep -iE "VPN|tun" | head -40
}

adb install -r "$APK" || fail "install failed"
adb shell appops set "$PKG" ACTIVATE_VPN allow

cat > /tmp/kavach_proxy.xml <<XML
<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <boolean name="enabled" value="true" />
    <string name="custom_proxies">10.0.2.2:3128</string>
    <set name="bypass_apps" />
</map>
XML
adb shell run-as "$PKG" mkdir -p shared_prefs
adb exec-in run-as "$PKG" sh -c 'cat > shared_prefs/kavach_proxy.xml' < /tmp/kavach_proxy.xml
adb shell run-as "$PKG" cat shared_prefs/kavach_proxy.xml

adb logcat -c
adb shell am start -n "$PKG/.KavachOnActivity"

echo "Waiting for proxy mode to route all traffic..."
for _ in $(seq 1 60); do
  adb logcat -d -s KavachProxy:I | grep -q "routing all traffic" && break
  sleep 3
done
adb logcat -d -s KavachProxy:I | grep -q "routing all traffic" || fail "proxy mode never started routing"
sleep 3

echo "--- plain client (no proxy support) to example.com"
OUT=$(adb shell 'printf "GET / HTTP/1.0\r\nHost: example.com\r\n\r\n" | nc -w 20 example.com 80' | head -1)
echo "$OUT"
echo "$OUT" | grep -q "^HTTP/1.[01] 200" || fail "example.com did not load through the tunnel: $OUT"
grep -q "CONNECT example.com:80" "$PROXY_LOG" || fail "example.com did not go through the proxy"

echo "--- Google"
OUT=$(adb shell 'printf "GET /generate_204 HTTP/1.0\r\nHost: www.google.com\r\n\r\n" | nc -w 20 www.google.com 80' | head -1)
echo "$OUT"
echo "$OUT" | grep -q " 204" || fail "Google generate_204 failed through the tunnel: $OUT"
grep -q "CONNECT www.google.com:80" "$PROXY_LOG" || fail "Google did not go through the proxy"

echo "--- blocked host"
OUT=$(adb shell 'printf "GET / HTTP/1.0\r\nHost: doubleclick.net\r\n\r\n" | nc -w 10 doubleclick.net 80' | head -1)
echo "got: '$OUT'"
grep -q "doubleclick.net" "$PROXY_LOG" && fail "blocked host reached the proxy"

echo "--- proxy log"; cat "$PROXY_LOG"
echo "Proxy mode e2e passed."
