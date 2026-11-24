package com.chinmay.kavach.proxy

import com.chinmay.kavach.vpn.AdBlockState
import com.chinmay.kavach.vpn.Blocklist
import kotlinx.coroutines.flow.update
import java.io.BufferedInputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.URI
import java.util.Collections
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.atomic.AtomicInteger

/**
 * The HTTP proxy that Kavach's VPN hands to every app in proxy mode. It
 * listens on the loopback interface only, so nothing on the Wi-Fi or mobile
 * network can reach it.
 *
 * For each request it:
 *  1. blocks it if the host is on the blocklist. With a proxy set, apps don't
 *     look domains up themselves (the proxy does), so this is where ad
 *     blocking happens for proxied traffic;
 *  2. otherwise forwards it to the current free proxy from [pool]. If that
 *     proxy fails, or opens the tunnel but the site never answers, the app's
 *     first bytes are replayed on the next proxy. The app never sees the
 *     failed attempt.
 *
 * HTTPS goes through as a CONNECT tunnel, so neither Kavach nor the free
 * proxy can read it. Plain HTTP is readable by the free proxy's operator.
 */
class LocalProxy(private val pool: UpstreamPool) {

    data class Target(val host: String, val port: Int, val connect: Boolean)

    /**
     * A fixed port, so a restart of proxy mode hands apps the same address:
     * an app still holding the previous proxy setting keeps working. Falls
     * back to any free port if another app already uses it.
     */
    private val server: ServerSocket = ServerSocket().apply {
        reuseAddress = true
        try {
            bind(InetSocketAddress(InetAddress.getLoopbackAddress(), PREFERRED_PORT), BACKLOG)
        } catch (_: IOException) {
            bind(InetSocketAddress(InetAddress.getLoopbackAddress(), 0), BACKLOG)
        }
    }
    private val workers: ExecutorService = Executors.newCachedThreadPool()
    private val open = Collections.newSetFromMap(java.util.concurrent.ConcurrentHashMap<Socket, Boolean>())
    private val active = AtomicInteger()
    @Volatile private var stopped = false

    val port: Int get() = server.localPort

    fun start() {
        Thread(::acceptLoop, "kavach-proxy").start()
    }

    fun stop() {
        stopped = true
        closeQuietly(server)
        open.toList().forEach(::closeQuietly)
        workers.shutdownNow()
    }

    private fun acceptLoop() {
        while (!stopped) {
            val client = try {
                server.accept()
            } catch (_: IOException) {
                break
            }
            AdBlockState.proxyReceived.update { it + 1 }
            if (active.incrementAndGet() > MAX_CONNECTIONS) {
                active.decrementAndGet()
                closeQuietly(client)
                continue
            }
            try {
                workers.execute { serve(client) }
            } catch (_: RejectedExecutionException) {
                active.decrementAndGet()
                closeQuietly(client)
            }
        }
    }

    private class Opened(val socket: Socket, val entry: UpstreamPool.Entry, val firstReply: ByteArray)

    private fun serve(client: Socket) {
        open += client
        var upstream: Socket? = null
        try {
            client.soTimeout = HANDSHAKE_TIMEOUT_MS
            val clientIn = BufferedInputStream(client.getInputStream())
            val clientOut = client.getOutputStream()
            val head = readHead(clientIn) ?: return
            val target = parseTarget(head.decodeToString()) ?: return reply(clientOut, 400, "Bad Request")

            val blocked = Blocklist.isBlocked(target.host)
            AdBlockState.onQuery(target.host, wasBlocked = blocked)
            if (blocked) return reply(clientOut, 403, "Blocked by Kavach")

            // What the app sends first: the HTTP request itself, or, inside a
            // CONNECT tunnel, the TLS ClientHello. Holding on to it lets us
            // replay it on the next proxy if this one never answers.
            val first = if (target.connect) {
                clientOut.write("HTTP/1.1 200 Connection established\r\n\r\n".toByteArray())
                clientOut.flush()
                client.soTimeout = FIRST_CLIENT_BYTES_TIMEOUT_MS
                readFirstPayload(clientIn) ?: return // app closed a pre-opened tunnel unused
            } else {
                head
            }

            val opened = openUpstream(target, first)
            if (opened == null) {
                AdBlockState.proxyFailed.update { it + 1 }
                // After "200 Connection established" all we can do is close.
                if (!target.connect) reply(clientOut, 502, "No working proxy")
                return
            }
            upstream = opened.socket
            open += opened.socket
            AdBlockState.proxyOk.update { it + 1 }
            clientOut.write(opened.firstReply)
            clientOut.flush()
            client.soTimeout = IDLE_TIMEOUT_MS
            opened.socket.soTimeout = IDLE_TIMEOUT_MS
            relay(client, clientIn, opened.socket)
        } catch (_: IOException) {
            // Client went away or a socket timed out. Hosts are deliberately not logged.
        } finally {
            upstream?.let { open -= it; closeQuietly(it) }
            open -= client
            closeQuietly(client)
            active.decrementAndGet()
        }
    }

    /**
     * Tries the current proxy, then the next ones. A proxy only counts as
     * working once the site's first bytes come back through it: free proxies
     * often accept a CONNECT and then drop or stall the tunnel (Google resets
     * many of them), which apps show as "No internet".
     */
    private fun openUpstream(target: Target, first: ByteArray): Opened? {
        for (entry in pool.attemptOrder(MAX_ATTEMPTS)) {
            val socket = Socket()
            try {
                socket.connect(InetSocketAddress(entry.proxy.host, entry.proxy.port), CONNECT_TIMEOUT_MS)
                socket.soTimeout = HANDSHAKE_TIMEOUT_MS
                socket.tcpNoDelay = true
                val input = socket.getInputStream()
                val out = socket.getOutputStream()
                if (target.connect) {
                    val authority = authority(target)
                    out.write("CONNECT $authority HTTP/1.1\r\nHost: $authority\r\n\r\n".toByteArray())
                    out.flush()
                    val response = readHead(input) ?: throw IOException("No CONNECT reply")
                    if (statusCode(response.decodeToString()) != 200) throw IOException("CONNECT refused")
                }
                out.write(first)
                out.flush()
                // Plain HTTP may still have a request body to send, so don't wait for a reply.
                if (!target.connect) {
                    pool.reportSuccess(entry)
                    return Opened(socket, entry, ByteArray(0))
                }
                socket.soTimeout = FIRST_REPLY_TIMEOUT_MS
                val buf = ByteArray(16_384)
                val n = input.read(buf)
                if (n <= 0) throw IOException("Tunnel closed without an answer")
                pool.reportSuccess(entry)
                return Opened(socket, entry, buf.copyOf(n))
            } catch (_: IOException) {
                closeQuietly(socket)
                pool.reportFailure(entry)
            }
        }
        return null
    }

    private fun relay(client: Socket, clientIn: InputStream, upstream: Socket) {
        val upload = try {
            workers.submit(Runnable { copy(clientIn, upstream.getOutputStream(), upstream) })
        } catch (_: RejectedExecutionException) {
            return
        }
        copy(upstream.getInputStream(), client.getOutputStream(), client)
        upload.cancel(true)
    }

    /** Copies until EOF, then half-closes [sink] so the other side sees the end too. */
    private fun copy(from: InputStream, to: OutputStream, sink: Socket) {
        val buf = ByteArray(16_384)
        try {
            while (true) {
                val n = from.read(buf)
                if (n < 0) break
                to.write(buf, 0, n)
                to.flush()
            }
            sink.shutdownOutput()
        } catch (_: IOException) {
            closeQuietly(sink)
        }
    }

    private fun reply(out: OutputStream, code: Int, reason: String) {
        try {
            out.write("HTTP/1.1 $code $reason\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".toByteArray())
            out.flush()
        } catch (_: IOException) {
        }
    }

    companion object {
        const val PREFERRED_PORT = 28_283
        private const val BACKLOG = 128
        private const val MAX_CONNECTIONS = 256
        private const val MAX_ATTEMPTS = 3
        // Kept short: apps give up on a page after ~15-30 s, and up to three proxies are tried.
        private const val CONNECT_TIMEOUT_MS = 4_000
        private const val HANDSHAKE_TIMEOUT_MS = 6_000
        private const val FIRST_REPLY_TIMEOUT_MS = 5_000
        private const val FIRST_CLIENT_BYTES_TIMEOUT_MS = 60_000
        private const val IDLE_TIMEOUT_MS = 5 * 60_000
        private const val MAX_HEAD = 32 * 1024
        private const val MAX_FIRST_PAYLOAD = 64 * 1024

        /** Reads an HTTP head up to and including the blank line. Null on EOF or oversize. */
        fun readHead(input: InputStream): ByteArray? {
            val out = java.io.ByteArrayOutputStream(512)
            var match = 0 // progress through \r\n\r\n
            while (out.size() < MAX_HEAD) {
                val b = input.read()
                if (b < 0) return null
                out.write(b)
                match = when {
                    b == '\r'.code && (match == 0 || match == 2) -> match + 1
                    b == '\n'.code && (match == 1 || match == 3) -> match + 1
                    b == '\r'.code -> 1
                    else -> 0
                }
                if (match == 4) return out.toByteArray()
            }
            return null
        }

        /**
         * Reads the app's first payload in a tunnel. For TLS it waits for the
         * whole first record (the ClientHello), so a replay is complete.
         */
        fun readFirstPayload(input: InputStream): ByteArray? {
            val out = java.io.ByteArrayOutputStream(2_048)
            val buf = ByteArray(16_384)
            while (true) {
                val n = input.read(buf)
                if (n < 0) return if (out.size() > 0) out.toByteArray() else null
                out.write(buf, 0, n)
                val bytes = out.toByteArray()
                val need = tlsRecordSize(bytes) ?: return bytes // not TLS: send what we have
                if (bytes.size >= need || bytes.size >= MAX_FIRST_PAYLOAD) return bytes
            }
        }

        /** Size of the first TLS record including its 5-byte header, or null if this isn't TLS. */
        fun tlsRecordSize(bytes: ByteArray): Int? {
            if (bytes.isEmpty() || bytes[0].toInt() != 0x16) return null
            if (bytes.size < 5) return 5 + 1 // need the header first
            val len = ((bytes[3].toInt() and 0xff) shl 8) or (bytes[4].toInt() and 0xff)
            return 5 + len
        }

        /** Where a proxy request is going: `CONNECT host:port` or `GET http://host/...`. */
        fun parseTarget(head: String): Target? {
            val lines = head.split("\r\n")
            val parts = lines.firstOrNull()?.split(' ') ?: return null
            if (parts.size < 3 || !parts[2].startsWith("HTTP/")) return null
            val method = parts[0]
            val uri = parts[1]
            if (method.equals("CONNECT", ignoreCase = true)) {
                return splitAuthority(uri, defaultPort = 443)?.let { (h, p) -> Target(h, p, connect = true) }
            }
            if (uri.startsWith("http://", ignoreCase = true)) {
                val parsed = runCatching { URI(uri) }.getOrNull() ?: return null
                val host = parsed.host?.trim('[', ']')?.lowercase() ?: return null
                val port = if (parsed.port == -1) 80 else parsed.port
                return if (port in 1..65_535) Target(host, port, connect = false) else null
            }
            // Origin-form ("GET /path"): the target is in the Host header.
            val hostHeader = lines.drop(1)
                .firstOrNull { it.startsWith("host:", ignoreCase = true) }
                ?.substringAfter(':')?.trim() ?: return null
            return splitAuthority(hostHeader, defaultPort = 80)?.let { (h, p) -> Target(h, p, connect = false) }
        }

        fun statusCode(head: String): Int? =
            head.substringBefore("\r\n").split(' ').getOrNull(1)?.toIntOrNull()

        private fun authority(t: Target): String =
            if (t.host.contains(':')) "[${t.host}]:${t.port}" else "${t.host}:${t.port}"

        private fun splitAuthority(value: String, defaultPort: Int): Pair<String, Int>? {
            val (host, portText) = if (value.startsWith("[")) {
                val end = value.indexOf(']')
                if (end < 0) return null
                value.substring(1, end) to value.substring(end + 1).removePrefix(":")
            } else {
                value.substringBeforeLast(':', value) to
                    (if (value.contains(':')) value.substringAfterLast(':') else "")
            }
            val port = if (portText.isEmpty()) defaultPort else portText.toIntOrNull() ?: return null
            if (host.isEmpty() || port !in 1..65_535) return null
            return host.lowercase() to port
        }

        private fun closeQuietly(c: java.io.Closeable) {
            try {
                c.close()
            } catch (_: IOException) {
            }
        }
    }
}
