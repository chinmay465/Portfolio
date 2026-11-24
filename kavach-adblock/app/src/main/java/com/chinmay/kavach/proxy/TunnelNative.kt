package com.chinmay.kavach.proxy

/**
 * JNI binding for hev-socks5-tunnel (MIT, github.com/heiher/hev-socks5-tunnel),
 * built by `scripts/build-tunnel.sh` with this class as its registration
 * target. The method names are the library's own.
 *
 * Loading the library is deferred until proxy mode first starts, so DNS-only
 * mode never touches native code.
 */
@Suppress("FunctionName")
internal object TunnelNative {
    init {
        System.loadLibrary("hev-socks5-tunnel")
    }

    /** Starts the tunnel on its own thread with [configPath] (YAML) and the tun [fd]. */
    external fun TProxyStartService(configPath: String, fd: Int): Boolean

    external fun TProxyStopService(): Boolean

    external fun TProxyIsRunning(): Boolean

    /** tx packets, tx bytes, rx packets, rx bytes. */
    external fun TProxyGetStats(): LongArray
}
