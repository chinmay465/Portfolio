package com.chinmay.kavach.proxy

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import kotlin.concurrent.thread

class LocalProxyTest {

    private val closeables = mutableListOf<AutoCloseable>()

    @After
    fun tearDown() = closeables.reversed().forEach { runCatching { it.close() } }

    @Test
    fun parsesConnectAbsoluteAndOriginFormTargets() {
        assertEquals(
            LocalProxy.Target("example.com", 443, connect = true),
            LocalProxy.parseTarget("CONNECT Example.com:443 HTTP/1.1\r\nHost: example.com:443\r\n\r\n"),
        )
        assertEquals(
            LocalProxy.Target("2001:db8::1", 8443, connect = true),
            LocalProxy.parseTarget("CONNECT [2001:db8::1]:8443 HTTP/1.1\r\n\r\n"),
        )
        assertEquals(
            LocalProxy.Target("ads.example.net", 80, connect = false),
            LocalProxy.parseTarget("GET http://ads.example.net/banner.js HTTP/1.1\r\nHost: ads.example.net\r\n\r\n"),
        )
        assertEquals(
            LocalProxy.Target("example.org", 8080, connect = false),
            LocalProxy.parseTarget("GET http://example.org:8080/ HTTP/1.1\r\n\r\n"),
        )
        assertEquals(
            LocalProxy.Target("example.org", 80, connect = false),
            LocalProxy.parseTarget("GET /index.html HTTP/1.1\r\nhost: Example.org\r\n\r\n"),
        )
        assertNull(LocalProxy.parseTarget("garbage\r\n\r\n"))
        assertNull(LocalProxy.parseTarget("CONNECT example.com:99999 HTTP/1.1\r\n\r\n"))
        assertNull(LocalProxy.parseTarget("GET /x HTTP/1.1\r\n\r\n"))
    }

    @Test
    fun readsHeadUpToBlankLine() {
        val head = LocalProxy.readHead(ByteArrayInputStream("CONNECT a:443 HTTP/1.1\r\n\r\nBODY".toByteArray()))
        assertEquals("CONNECT a:443 HTTP/1.1\r\n\r\n", head!!.decodeToString())
        assertNull(LocalProxy.readHead(ByteArrayInputStream("CONNECT a:443 HTTP/1.1\r\n".toByteArray())))
        assertEquals(200, LocalProxy.statusCode("HTTP/1.1 200 Connection established\r\n\r\n"))
        assertEquals(407, LocalProxy.statusCode("HTTP/1.0 407 Proxy Authentication Required\r\n"))
    }

    /** A fake upstream HTTP proxy: answers CONNECT with 200, then echoes bytes back. */
    private fun fakeUpstream(seen: MutableList<String>): ServerSocket {
        val server = ServerSocket(0, 8, InetAddress.getLoopbackAddress())
        closeables += server
        thread(isDaemon = true) {
            while (!server.isClosed) {
                val s = runCatching { server.accept() }.getOrNull() ?: break
                thread(isDaemon = true) {
                    s.use {
                        val head = LocalProxy.readHead(it.getInputStream()) ?: return@use
                        synchronized(seen) { seen += head.decodeToString().substringBefore("\r\n") }
                        it.getOutputStream().write("HTTP/1.1 200 OK\r\n\r\n".toByteArray())
                        val buf = ByteArray(1024)
                        while (true) {
                            val n = it.getInputStream().read(buf)
                            if (n < 0) break
                            it.getOutputStream().write(buf, 0, n)
                        }
                    }
                }
            }
        }
        return server
    }

    private fun deadPort(): Int = ServerSocket(0, 1, InetAddress.getLoopbackAddress()).use { it.localPort }

    @Test
    fun tunnelsThroughTheFirstWorkingProxyAndDropsTheDeadOne() {
        val seen = mutableListOf<String>()
        val upstream = fakeUpstream(seen)
        val pool = UpstreamPool(maxFails = 1)
        pool.replace(
            listOf(
                UpstreamPool.Entry(ProxyServer("127.0.0.1", deadPort()), 10, "198.51.100.1"),
                UpstreamPool.Entry(ProxyServer("127.0.0.1", upstream.localPort), 20, "198.51.100.2"),
            ),
        )
        val proxy = LocalProxy(pool).also { it.start() }
        closeables += AutoCloseable { proxy.stop() }

        Socket(InetAddress.getLoopbackAddress(), proxy.port).use { app ->
            app.soTimeout = 5_000
            app.getOutputStream().write("CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\n\r\n".toByteArray())
            val reply = LocalProxy.readHead(app.getInputStream())!!.decodeToString()
            assertTrue(reply, reply.startsWith("HTTP/1.1 200"))
            app.getOutputStream().write("hello".toByteArray())
            val echo = ByteArray(5)
            var got = 0
            while (got < 5) got += app.getInputStream().read(echo, got, 5 - got)
            assertEquals("hello", echo.decodeToString())
        }
        assertEquals(listOf("CONNECT example.com:443 HTTP/1.1"), synchronized(seen) { seen.toList() })
        assertEquals(1, pool.size())
        assertEquals("198.51.100.2", pool.current()!!.exitIp)
    }

    /** Accepts CONNECT with 200, then closes the tunnel without relaying anything. */
    private fun stallingUpstream(): ServerSocket {
        val server = ServerSocket(0, 8, InetAddress.getLoopbackAddress())
        closeables += server
        thread(isDaemon = true) {
            while (!server.isClosed) {
                val s = runCatching { server.accept() }.getOrNull() ?: break
                s.use {
                    LocalProxy.readHead(it.getInputStream())
                    it.getOutputStream().write("HTTP/1.1 200 OK\r\n\r\n".toByteArray())
                    it.getInputStream().read(ByteArray(64))
                }
            }
        }
        return server
    }

    private fun connectAndEcho(port: Int): String {
        Socket(InetAddress.getLoopbackAddress(), port).use { app ->
            app.soTimeout = 15_000
            app.getOutputStream().write("CONNECT www.google.com:443 HTTP/1.1\r\n\r\n".toByteArray())
            val reply = LocalProxy.readHead(app.getInputStream())!!.decodeToString()
            assertTrue(reply, reply.startsWith("HTTP/1.1 200"))
            app.getOutputStream().write("hello".toByteArray())
            val echo = ByteArray(5)
            var got = 0
            while (got < 5) {
                val n = app.getInputStream().read(echo, got, 5 - got)
                if (n < 0) return echo.copyOf(got).decodeToString()
                got += n
            }
            return echo.decodeToString()
        }
    }

    @Test
    fun replaysTheFirstBytesWhenAProxyOpensTheTunnelButNeverAnswers() {
        val seen = mutableListOf<String>()
        val stalling = stallingUpstream()
        val working = fakeUpstream(seen)
        val pool = UpstreamPool(maxFails = 1)
        pool.replace(
            listOf(
                UpstreamPool.Entry(ProxyServer("127.0.0.1", stalling.localPort), 10, "198.51.100.1"),
                UpstreamPool.Entry(ProxyServer("127.0.0.1", working.localPort), 20, "198.51.100.2"),
            ),
        )
        val proxy = LocalProxy(pool).also { it.start() }
        closeables += AutoCloseable { proxy.stop() }

        assertEquals("hello", connectAndEcho(proxy.port))
        assertEquals(1, pool.size())
        assertEquals("198.51.100.2", pool.current()!!.exitIp)
    }

    @Test
    fun closesTheTunnelWhenNoProxyWorks() {
        val pool = UpstreamPool()
        pool.replace(listOf(UpstreamPool.Entry(ProxyServer("127.0.0.1", deadPort()), 10, "198.51.100.1")))
        val proxy = LocalProxy(pool).also { it.start() }
        closeables += AutoCloseable { proxy.stop() }

        assertEquals("", connectAndEcho(proxy.port))
    }

    @Test
    fun answers502ForPlainHttpWhenNoProxyWorks() {
        val pool = UpstreamPool()
        pool.replace(listOf(UpstreamPool.Entry(ProxyServer("127.0.0.1", deadPort()), 10, "198.51.100.1")))
        val proxy = LocalProxy(pool).also { it.start() }
        closeables += AutoCloseable { proxy.stop() }

        Socket(InetAddress.getLoopbackAddress(), proxy.port).use { app ->
            app.soTimeout = 5_000
            app.getOutputStream().write("GET http://example.com/ HTTP/1.1\r\nHost: example.com\r\n\r\n".toByteArray())
            val reply = LocalProxy.readHead(app.getInputStream())!!.decodeToString()
            assertTrue(reply, reply.startsWith("HTTP/1.1 502"))
        }
    }

    @Test
    fun waitsForTheWholeTlsClientHello() {
        val record = byteArrayOf(0x16, 0x03, 0x01, 0x00, 0x06, 1, 2, 3, 4, 5, 6)
        // Delivered in three pieces, as a slow socket might.
        val chunks = ArrayDeque(listOf(record.copyOfRange(0, 3), record.copyOfRange(3, 7), record.copyOfRange(7, 11)))
        val input = object : java.io.InputStream() {
            override fun read(): Int = throw UnsupportedOperationException()
            override fun read(b: ByteArray, off: Int, len: Int): Int {
                val c = chunks.removeFirstOrNull() ?: return -1
                c.copyInto(b, off)
                return c.size
            }
        }
        assertEquals(record.toList(), LocalProxy.readFirstPayload(input)!!.toList())
        assertEquals(11, LocalProxy.tlsRecordSize(record))
        assertNull(LocalProxy.tlsRecordSize("GET".toByteArray()))
        assertNull(LocalProxy.readFirstPayload(ByteArrayInputStream(ByteArray(0))))
    }
}
