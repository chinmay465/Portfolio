package com.chinmay.kavach.proxy

import java.io.IOException
import java.net.HttpURLConnection
import java.net.InetSocketAddress
import java.net.Proxy
import java.net.URI

/**
 * Tests a proxy from the phone itself, with two HTTPS requests through it
 * (CONNECT tunnels, TLS verified normally, so an intercepting proxy fails):
 *
 *  1. Google's `generate_204`, by hostname. Many free proxies relay some sites
 *     but get reset by Google or can't resolve names, which leaves Google
 *     Search showing "No internet" while the proxy looks fine elsewhere.
 *  2. Cloudflare's trace page, which reports the proxy's exit IP.
 *
 * Returns the Google latency and the exit IP, or null when either fails.
 */
object ProxyChecker {

    const val GOOGLE_URL = "https://www.google.com/generate_204"
    const val TRACE_URL = "https://1.1.1.1/cdn-cgi/trace"

    data class Result(val latencyMs: Int, val exitIp: String)

    fun check(proxy: ProxyServer, timeoutMs: Int = 6_000): Result? {
        val route = Proxy(Proxy.Type.HTTP, InetSocketAddress(proxy.host, proxy.port))
        val started = System.nanoTime()
        if (request(route, GOOGLE_URL, timeoutMs) { code, _ -> code == HttpURLConnection.HTTP_NO_CONTENT } == null) {
            return null
        }
        val latencyMs = ((System.nanoTime() - started) / 1_000_000).toInt()
        val ip = request(route, TRACE_URL, timeoutMs) { code, body ->
            if (code == HttpURLConnection.HTTP_OK) parseTraceIp(body) else null
        } ?: return null
        return Result(latencyMs, ip)
    }

    /** Only Google needs re-testing in the background: the exit IP doesn't change. */
    fun reachesGoogle(proxy: ProxyServer, timeoutMs: Int = 6_000): Boolean {
        val route = Proxy(Proxy.Type.HTTP, InetSocketAddress(proxy.host, proxy.port))
        return request(route, GOOGLE_URL, timeoutMs) { code, _ -> code == HttpURLConnection.HTTP_NO_CONTENT } != null
    }

    private fun <T : Any> request(route: Proxy, url: String, timeoutMs: Int, read: (Int, String) -> T?): T? =
        try {
            val conn = URI(url).toURL().openConnection(route) as HttpURLConnection
            conn.connectTimeout = timeoutMs
            conn.readTimeout = timeoutMs
            conn.instanceFollowRedirects = false
            conn.useCaches = false
            conn.setRequestProperty("User-Agent", "Kavach")
            try {
                val code = conn.responseCode
                val body = if (code == HttpURLConnection.HTTP_OK) {
                    conn.inputStream.use { it.readBytes().take(4_096).toByteArray().decodeToString() }
                } else {
                    ""
                }
                read(code, body)
            } finally {
                conn.disconnect()
            }
        } catch (_: IOException) {
            null
        } catch (_: RuntimeException) {
            null
        }

    /** Cloudflare's trace page is `key=value` lines; returns the `ip=` value. */
    fun parseTraceIp(body: String): String? =
        body.lineSequence()
            .map { it.trim() }
            .firstOrNull { it.startsWith("ip=") }
            ?.removePrefix("ip=")
            ?.takeIf { it.isNotEmpty() && it.length <= 45 }
}
