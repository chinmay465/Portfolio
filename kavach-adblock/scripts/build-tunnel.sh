#!/usr/bin/env bash
# Builds hev-socks5-tunnel (MIT, https://github.com/heiher/hev-socks5-tunnel),
# the userspace TCP/IP stack behind proxy mode's full tunnel, with the NDK and
# copies libhev-socks5-tunnel.so into app/src/main/jniLibs/<abi>/.
# Run from kavach-adblock/ before ./gradlew assembleDebug. CI does this.
set -euo pipefail

HEV_TAG=2.20.0
HEV_COMMIT=75dbc1e9ace6c70d3d1b94df7c283efe1de7effc
ABIS="arm64-v8a armeabi-v7a x86_64"

NDK=${ANDROID_NDK_HOME:-${ANDROID_NDK_LATEST_HOME:-${ANDROID_NDK_ROOT:-}}}
[ -x "$NDK/ndk-build" ] || { echo "::error::ndk-build not found; set ANDROID_NDK_HOME"; exit 1; }

WORK=build/hev-ndk
if [ "$(git -C "$WORK/jni" rev-parse HEAD 2>/dev/null)" != "$HEV_COMMIT" ]; then
  rm -rf "$WORK"
  git -c advice.detachedHead=false clone -q --depth 1 --branch "$HEV_TAG" \
    --recurse-submodules --shallow-submodules \
    https://github.com/heiher/hev-socks5-tunnel "$WORK/jni"
  [ "$(git -C "$WORK/jni" rev-parse HEAD)" = "$HEV_COMMIT" ] || { echo "::error::hev $HEV_TAG is not $HEV_COMMIT"; exit 1; }
fi

# Register the JNI methods on com.chinmay.kavach.proxy.TunnelNative.
cat > "$WORK/jni/Application.mk" <<MK
APP_OPTIM := release
APP_PLATFORM := android-29
APP_ABI := $ABIS
APP_CFLAGS := -O3 -DPKGNAME=com/chinmay/kavach/proxy -DCLSNAME=TunnelNative
APP_SUPPORT_FLEXIBLE_PAGE_SIZES := true
NDK_TOOLCHAIN_VERSION := clang
MK

"$NDK/ndk-build" -C "$WORK" -j"$(nproc)" > "$WORK/ndk-build.log" 2>&1 || { tail -50 "$WORK/ndk-build.log"; exit 1; }

for abi in $ABIS; do
  mkdir -p "app/src/main/jniLibs/$abi"
  cp "$WORK/libs/$abi/libhev-socks5-tunnel.so" "app/src/main/jniLibs/$abi/"
done
ls -l app/src/main/jniLibs/*/libhev-socks5-tunnel.so
