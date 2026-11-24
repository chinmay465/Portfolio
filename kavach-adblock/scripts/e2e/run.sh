#!/usr/bin/env bash
# Emulator test for proxy mode's full tunnel. Expects connect-proxy.py on the
# host at port 3128 (the emulator reaches the host as 10.0.2.2) logging to
# $PROXY_LOG. Checks that a plain command-line client, which knows nothing
# about proxies, has its traffic routed through Kavach and the proxy, and
# that blocklisted hosts are stopped.
set -uo pipefail
PKG=com.chinmay.kavach
DATA=/data/data/$PKG
APK=app/build/outputs/apk/debug/app-debug.apk
PROXY_LOG=${PROXY_LOG:-/tmp/proxy.log}
FAILED=0
check() { if eval "$2"; then echo "PASS: $1"; else echo "::error::FAIL: $1"; FAILED=1; fi; }
dump() {
  echo "--- proxy log"; cat "$PROXY_LOG"
  echo "--- kavach logcat"; adb logcat -d -s KavachProxy KavachLocal KavachTunnel KavachVpn AndroidRuntime | tail -120
  echo "--- engine log"; adb shell run-as "$PKG" cat "$DATA/no_backup/tunnel.log" | tail -120
  echo "--- connectivity"; adb shell dumpsys connectivity | grep -iE "VPN|tun" | head -20
}

adb install -r "$APK" || { echo "::error::install failed"; exit 1; }
adb shell appops set "$PKG" ACTIVATE_VPN allow

cat > /tmp/kavach_proxy.xml <<XML
<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <boolean name="enabled" value="true" />
    <boolean name="engine_log" value="true" />
    <string name="custom_proxies">10.0.2.2:3128</string>
    <set name="bypass_apps" />
</map>
XML
adb shell run-as "$PKG" mkdir -p "$DATA/shared_prefs"
adb shell "run-as $PKG sh -c 'cat > $DATA/shared_prefs/kavach_proxy.xml'" < /tmp/kavach_proxy.xml
adb shell run-as "$PKG" cat "$DATA/shared_prefs/kavach_proxy.xml"

adb logcat -c
adb shell am start -n "$PKG/.KavachOnActivity"

echo "Waiting for proxy mode to route all traffic..."
for _ in $(seq 1 60); do
  adb logcat -d -s KavachProxy:I | grep -q "routing all traffic" && break
  sleep 3
done
if ! adb logcat -d -s KavachProxy:I | grep -q "routing all traffic"; then
  echo "::error::proxy mode never started routing"; dump; exit 1
fi
echo "--- listener right after routing"
adb shell 'cat /proc/net/tcp /proc/net/tcp6' | grep -i ':6E5B ' | head -3
sleep 3

echo "--- probes"
adb shell 'cat /proc/net/tcp /proc/net/tcp6' | grep -i ':6E5B ' | head -5
adb shell 'nc -w 2 127.0.0.1 28283 < /dev/null 2>&1; echo "nc loopback rc=$?"'
adb shell 'nc -w 2 ::1 28283 < /dev/null 2>&1; echo "nc loopback6 rc=$?"'
adb shell 'id; ip rule 2>&1 | head -40' 
adb logcat -d -s KavachProxy KavachLocal | tail -5
adb shell 'ping -c 1 -W 3 example.com 2>&1' | head -2
adb shell 'getprop net.dns1; cat /proc/net/route | head -3' 2>&1
adb shell 'echo | nc -w 5 example.com 80 2>&1; echo "nc rc=$?"'

echo "--- plain client (no proxy support) to example.com"
OUT=$(adb shell 'printf "GET / HTTP/1.0\r\nHost: example.com\r\n\r\n" | nc -w 20 example.com 80 2>&1' | head -3)
echo "$OUT"
check "example.com loads through the tunnel" 'echo "$OUT" | grep -q "HTTP/1.[01] 200"'
check "example.com went through the proxy" 'grep -q "CONNECT example.com:80" "$PROXY_LOG"'

echo "--- Google"
OUT=$(adb shell 'printf "GET /generate_204 HTTP/1.0\r\nHost: www.google.com\r\n\r\n" | nc -w 20 www.google.com 80 2>&1' | head -3)
echo "$OUT"
check "Google answers through the tunnel" 'echo "$OUT" | grep -q " 204"'
check "Google went through the proxy" 'grep -q "CONNECT www.google.com:80" "$PROXY_LOG"'

echo "--- blocked host"
OUT=$(adb shell 'printf "GET / HTTP/1.0\r\nHost: doubleclick.net\r\n\r\n" | nc -w 10 doubleclick.net 80 2>&1' | head -3)
echo "got: '$OUT'"
check "blocked host never reaches the proxy" '! grep -q "doubleclick.net" "$PROXY_LOG"'

dump
[ "$FAILED" = 0 ] && echo "Proxy mode e2e passed." || exit 1
