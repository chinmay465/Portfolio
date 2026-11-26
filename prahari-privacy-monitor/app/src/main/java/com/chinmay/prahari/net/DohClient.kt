package com.chinmay.prahari.net

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI

/**
 * DNS-over-HTTPS (RFC 8484) client. Queries leave the phone encrypted, so the
 * Wi-Fi owner, the mobile carrier or anyone on the network can't read or log
 * which domains your apps look up. There is deliberately no plaintext fallback.
 */
class DohClient internal constructor(
    private val endpoints: List<String>,
    private val timeoutMs: Int,
    requireHttps: Boolean,
) {
    constructor(endpoints: List<String> = DEFAULT_ENDPOINTS, timeoutMs: Int = 5_000) :
        this(endpoints, timeoutMs, requireHttps = true)

    init {
        require(endpoints.isNotEmpty())
        if (requireHttps) require(endpoints.all { it.startsWith("https://") }) { "DoH endpoints must be https" }
    }

    /** Sends [query] (a raw DNS message) and returns the raw DNS response. */
    @Throws(IOException::class)
    fun resolve(query: ByteArray): ByteArray {
        var last: IOException? = null
        for (url in endpoints) {
            try {
                return post(url, query)
            } catch (e: IOException) {
                last = e
            }
        }
        throw last ?: IOException("No DoH endpoint")
    }

    private fun post(url: String, query: ByteArray): ByteArray {
        val conn = URI(url).toURL().openConnection() as HttpURLConnection
        conn.connectTimeout = timeoutMs
        conn.readTimeout = timeoutMs
        conn.requestMethod = "POST"
        conn.doOutput = true
        conn.instanceFollowRedirects = false
        conn.useCaches = false
        conn.setRequestProperty("Content-Type", DNS_MESSAGE)
        conn.setRequestProperty("Accept", DNS_MESSAGE)
        // Don't send the default User-Agent, which names the phone model and Android version.
        conn.setRequestProperty("User-Agent", "Prahari")
        conn.setFixedLengthStreamingMode(query.size)
        conn.outputStream.use { it.write(query) }

        val code = conn.responseCode
        if (code != HttpURLConnection.HTTP_OK) {
            conn.errorStream?.close()
            throw IOException("DoH HTTP $code")
        }
        val type = conn.contentType ?: ""
        if (!type.startsWith(DNS_MESSAGE)) {
            conn.inputStream.close()
            throw IOException("Unexpected DoH content type")
        }
        // Streams are closed but the connection is kept for reuse (HTTP keep-alive).
        return conn.inputStream.use { input ->
            val body = input.readBytes()
            if (body.size < 12 || body.size > MAX_DNS_MESSAGE) throw IOException("Bad DoH response size")
            body
        }
    }

    companion object {
        private const val DNS_MESSAGE = "application/dns-message"
        private const val MAX_DNS_MESSAGE = 65_535

        /**
         * Cloudflare first, then Quad9 as a different operator. Both state that
         * they don't store the client IP alongside queries. The IP-literal
         * Cloudflare URLs need no DNS lookup to bootstrap.
         */
        val DEFAULT_ENDPOINTS = listOf(
            "https://1.1.1.1/dns-query",
            "https://1.0.0.1/dns-query",
            "https://dns.quad9.net/dns-query",
        )
    }
}
