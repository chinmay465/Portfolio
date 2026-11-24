package com.chinmay.kavach.proxy

import android.content.Context
import android.util.Log
import java.io.File

/**
 * Proxy mode's full tunnel. The VPN captures every app's traffic, and
 * hev-socks5-tunnel (a userspace TCP/IP stack) turns each TCP connection
 * into a SOCKS5 CONNECT to Kavach's [LocalProxy], which sends it on through
 * a free proxy. Apps don't need to support proxies at all.
 *
 * DNS: the tunnel answers lookups itself with placeholder addresses from
 * 100.64.0.0/10 and remembers the name behind each one, so the SOCKS
 * request carries the real host name. Ad blocking works on that name, and
 * the free proxy does the real lookup (no DNS leaves the phone directly).
 * Only A records are answered, so apps use IPv4.
 */
object FullTunnel {
    private const val TAG = "KavachTunnel"

    const val MTU = 8_500
    const val ADDRESS_V4 = "198.18.0.1"
    const val ADDRESS_V6 = "fd00:6b76:6b76::1"
    const val DNS = "198.18.0.2"

    /**
     * Captured: everything except this phone, the local network, link-local
     * and multicast, which stay on the normal network (printers, Chromecast,
     * router pages keep working).
     */
    val ROUTES_V4: List<Pair<String, Int>> = Cidr.complement(
        listOf(
            "0.0.0.0/8", "10.0.0.0/8", "127.0.0.0/8", "169.254.0.0/16",
            "172.16.0.0/12", "192.168.0.0/16", "224.0.0.0/3",
        ),
    )

    @Volatile private var running = false

    fun config(socksPort: Int, logFile: String? = null): String = """
        tunnel:
          mtu: $MTU
          ipv4: $ADDRESS_V4
          ipv6: '$ADDRESS_V6'
        socks5:
          port: $socksPort
          address: 127.0.0.1
          udp: 'udp'
        mapdns:
          address: $DNS
          port: 53
          network: 100.64.0.0
          netmask: 255.192.0.0
          cache-size: 10000
        misc:
          connect-timeout: 30000
          tcp-read-write-timeout: 300000
          udp-read-write-timeout: 30000
          log-level: ${if (logFile != null) "debug" else "error"}
    """.trimIndent() + "\n" + (if (logFile != null) "  log-file: $logFile\n" else "")

    /** Starts the engine on [fd]. The caller keeps the fd open until [stop]. */
    @Synchronized
    fun start(ctx: Context, fd: Int, socksPort: Int): Boolean {
        if (running) stop()
        return try {
            // Engine log only when asked for (tests); it stays in private storage.
            val log = File(ctx.noBackupFilesDir, "tunnel.log")
                .takeIf { ProxySettings(ctx).engineLog }?.absolutePath
            val file = File(ctx.noBackupFilesDir, "tunnel.yml")
            file.writeText(config(socksPort, log))
            if (!TunnelNative.TProxyStartService(file.absolutePath, fd)) return false
            // A bad config makes the engine thread exit at once.
            Thread.sleep(300)
            running = TunnelNative.TProxyIsRunning()
            if (!running) Log.e(TAG, "Tunnel engine exited right after starting")
            running
        } catch (e: Throwable) {
            // UnsatisfiedLinkError if the native library is missing for this ABI.
            Log.e(TAG, "Could not start the tunnel engine", e)
            false
        }
    }

    @Synchronized
    fun stop() {
        if (!running) return
        running = false
        try {
            TunnelNative.TProxyStopService()
        } catch (e: Throwable) {
            Log.w(TAG, "Could not stop the tunnel engine", e)
        }
    }
}

/** IPv4 CIDR helpers. */
object Cidr {
    private data class Block(val start: Long, val prefix: Int) {
        val end: Long get() = start + (1L shl (32 - prefix)) - 1
    }

    private fun parse(cidr: String): Block {
        val (ip, len) = cidr.split('/')
        val v = ip.split('.').fold(0L) { acc, part -> (acc shl 8) or part.toLong() }
        return Block(v, len.toInt())
    }

    private fun format(v: Long): String = (3 downTo 0).joinToString(".") { ((v shr (8 * it)) and 0xff).toString() }

    /** The smallest set of CIDR blocks that covers 0.0.0.0/0 minus [excluded]. */
    fun complement(excluded: List<String>): List<Pair<String, Int>> {
        val ex = excluded.map(::parse)
        val out = ArrayList<Pair<String, Int>>()
        fun walk(b: Block) {
            when {
                ex.any { it.start <= b.start && b.end <= it.end } -> return // fully excluded
                ex.none { it.start <= b.end && b.start <= it.end } -> out += format(b.start) to b.prefix
                else -> {
                    val half = 1L shl (31 - b.prefix)
                    walk(Block(b.start, b.prefix + 1))
                    walk(Block(b.start + half, b.prefix + 1))
                }
            }
        }
        walk(Block(0, 0))
        return out
    }
}
