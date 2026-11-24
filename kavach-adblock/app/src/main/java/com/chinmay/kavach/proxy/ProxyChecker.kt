package com.chinmay.kavach.proxy

import java.io.IOException
import java.net.HttpURLConnection
import java.net.InetSocketAddress
import java.net.Proxy
import java.net.URI

/**
 * Tests a proxy from the phone itself: an HTTPS request through it (CONNECT)
 * to Cloudflare's trace page. TLS is verified normally, so a proxy that tries
 * to intercept HTTPS fails the check. Returns the latency and exit IP, or
 * null when the proxy doesn't work from here.
 */
object ProxyChecker {

    const val CHECK_URL = "https://1.1.1.1/cdn-cgi/trace"

    data class Result(val latencyMs: Int, val exitIp: String)

    fun check(proxy: ProxyServer, timeoutMs: Int = 6_000): Result? {
        val started = System.nanoTime()
        return try {
            val route = Proxy(Proxy.Type.HTTP, InetSocketAddress(proxy.host, proxy.port))
            val conn = URI(CHECK_URL).toURL().openConnection(route) as HttpURLConnection
            conn.connectTimeout = timeoutMs
            conn.readTimeout = timeoutMs
            conn.instanceFollowRedirects = false
            conn.useCaches = false
            conn.setRequestProperty("User-Agent", "Kavach")
            try {
                if (conn.responseCode != HttpURLConnection.HTTP_OK) return null
                val body = conn.inputStream.use { it.readBytes().take(4_096).toByteArray().decodeToString() }
                val ip = parseTraceIp(body) ?: return null
                Result(((System.nanoTime() - started) / 1_000_000).toInt(), ip)
            } finally {
                conn.disconnect()
            }
        } catch (_: IOException) {
            null
        } catch (_: RuntimeException) {
            null
        }
    }

    /** Cloudflare's trace page is `key=value` lines; returns the `ip=` value. */
    fun parseTraceIp(body: String): String? =
        body.lineSequence()
            .map { it.trim() }
            .firstOrNull { it.startsWith("ip=") }
            ?.removePrefix("ip=")
            ?.takeIf { it.isNotEmpty() && it.length <= 45 }
}
