package com.chinmay.kavach.proxy

import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI

/** One HTTP proxy from Setu's pool. Hosts are IPv4 literals, so using one needs no DNS lookup. */
data class ProxyServer(
    val host: String,
    val port: Int,
    /** Latency Setu measured from its server. The phone re-measures before use. */
    val setuLatencyMs: Int = 0,
) {
    val address: String get() = "$host:$port"
}

/**
 * Reads the validated proxy pool from a Setu hub (setu-proxy-hub in this repo).
 * Setu has already dropped dead, transparent and HTTPS-intercepting proxies and
 * ranks the rest, best first.
 */
class SetuClient(
    baseUrl: String,
    private val token: String?,
    private val timeoutMs: Int = 60_000, // a sleeping Render free instance takes ~50 s to wake
) {
    private val base: String = requireNotNull(normalizeUrl(baseUrl)) { "Setu URL must be https" }

    class AuthException : IOException("Setu rejected the token")

    @Throws(IOException::class)
    fun fetchPool(): List<ProxyServer> {
        val conn = URI("$base/api/pool").toURL().openConnection() as HttpURLConnection
        conn.connectTimeout = timeoutMs
        conn.readTimeout = timeoutMs
        conn.instanceFollowRedirects = false
        conn.useCaches = false
        conn.setRequestProperty("Accept", "application/json")
        conn.setRequestProperty("User-Agent", "Kavach")
        if (!token.isNullOrBlank()) conn.setRequestProperty("Authorization", "Bearer ${token.trim()}")
        try {
            when (val code = conn.responseCode) {
                HttpURLConnection.HTTP_OK -> Unit
                HttpURLConnection.HTTP_UNAUTHORIZED -> throw AuthException()
                else -> throw IOException("Setu HTTP $code")
            }
            val body = conn.inputStream.use { input ->
                val bytes = input.readNBytesCompat(MAX_BODY)
                String(bytes, Charsets.UTF_8)
            }
            return try {
                parsePool(body)
            } catch (_: org.json.JSONException) {
                throw IOException("Setu sent an unexpected response")
            }
        } finally {
            conn.errorStream?.close()
        }
    }

    companion object {
        const val DEFAULT_URL = "https://setu-proxy-hub.onrender.com"
        private const val MAX_BODY = 4 * 1024 * 1024
        private val ADDRESS = Regex("""^((?:\d{1,3}\.){3}\d{1,3}):(\d{1,5})$""")

        /** Trims, drops a trailing slash and requires https. Returns null when unusable. */
        fun normalizeUrl(input: String): String? {
            val url = input.trim().trimEnd('/')
            if (!url.startsWith("https://")) return null
            val host = runCatching { URI(url).host }.getOrNull()
            return if (host.isNullOrEmpty()) null else url
        }

        /** Parses Setu's `GET /api/pool` snapshot, keeping its best-first order. */
        fun parsePool(json: String): List<ProxyServer> {
            val proxies = JSONObject(json).optJSONArray("proxies") ?: return emptyList()
            val out = ArrayList<ProxyServer>(proxies.length())
            val seen = HashSet<String>()
            for (i in 0 until proxies.length()) {
                val entry = proxies.optJSONObject(i) ?: continue
                val match = ADDRESS.matchEntire(entry.optString("address")) ?: continue
                val host = match.groupValues[1]
                val port = match.groupValues[2].toInt()
                if (port !in 1..65_535) continue
                if (host.split('.').any { it.toInt() > 255 }) continue
                if (!seen.add("$host:$port")) continue
                out += ProxyServer(host, port, entry.optInt("latencyMs", 0))
            }
            return out
        }

        private fun java.io.InputStream.readNBytesCompat(limit: Int): ByteArray {
            val out = java.io.ByteArrayOutputStream()
            val buf = ByteArray(16_384)
            while (true) {
                val n = read(buf)
                if (n < 0) break
                out.write(buf, 0, n)
                if (out.size() > limit) throw IOException("Setu response too large")
            }
            return out.toByteArray()
        }
    }
}
