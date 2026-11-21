package com.chinmay.kavach.vpn

import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.net.InetAddress
import java.net.ServerSocket
import kotlin.concurrent.thread

class DohClientTest {

    private val servers = mutableListOf<ServerSocket>()

    @After
    fun tearDown() = servers.forEach { it.close() }

    private class Request(val headers: Map<String, String>, val body: ByteArray)

    /** Minimal one-shot HTTP server: records the request, answers with [status]/[type]/[body]. */
    private fun serve(status: Int, type: String, body: ByteArray, seen: MutableList<Request>): String {
        val server = ServerSocket(0, 1, InetAddress.getLoopbackAddress())
        servers += server
        thread(isDaemon = true) {
            server.accept().use { s ->
                val input = s.getInputStream()
                val headers = mutableMapOf<String, String>()
                readLine(input) // request line
                while (true) {
                    val line = readLine(input)
                    if (line.isEmpty()) break
                    val (k, v) = line.split(":", limit = 2)
                    headers[k.trim().lowercase()] = v.trim()
                }
                val len = headers["content-length"]?.toInt() ?: 0
                val reqBody = ByteArray(len)
                var read = 0
                while (read < len) read += input.read(reqBody, read, len - read)
                seen += Request(headers, reqBody)
                val head = "HTTP/1.1 $status X\r\nContent-Type: $type\r\nContent-Length: ${body.size}\r\nConnection: close\r\n\r\n"
                s.getOutputStream().apply { write(head.toByteArray()); write(body); flush() }
            }
        }
        return "http://127.0.0.1:${server.localPort}/dns-query"
    }

    private fun readLine(input: InputStream): String {
        val out = ByteArrayOutputStream()
        while (true) {
            val b = input.read()
            if (b < 0 || b == '\n'.code) break
            if (b != '\r'.code) out.write(b)
        }
        return out.toString(Charsets.US_ASCII.name())
    }

    private val query = ByteArray(29) { it.toByte() }
    private val answer = ByteArray(45) { (100 + it).toByte() }

    @Test
    fun postsDnsMessageWithoutDeviceUserAgent() {
        val seen = mutableListOf<Request>()
        val url = serve(200, "application/dns-message", answer, seen)

        val result = DohClient(listOf(url), 2_000, requireHttps = false).resolve(query)

        assertArrayEquals(answer, result)
        val req = seen.single()
        assertArrayEquals(query, req.body)
        assertEquals("application/dns-message", req.headers["content-type"])
        assertEquals("Kavach", req.headers["user-agent"])
    }

    @Test
    fun fallsBackToNextEndpoint() {
        val seen = mutableListOf<Request>()
        val broken = serve(500, "text/plain", "nope".toByteArray(), mutableListOf())
        val good = serve(200, "application/dns-message", answer, seen)

        val result = DohClient(listOf(broken, good), 2_000, requireHttps = false).resolve(query)

        assertArrayEquals(answer, result)
        assertEquals(1, seen.size)
    }

    @Test
    fun rejectsNonDnsResponses() {
        val url = serve(200, "text/html", ByteArray(100), mutableListOf())
        try {
            DohClient(listOf(url), 2_000, requireHttps = false).resolve(query)
            fail("expected IOException")
        } catch (_: IOException) {
        }
    }

    @Test
    fun refusesPlaintextEndpoints() {
        try {
            DohClient(listOf("http://1.1.1.1/dns-query"))
            fail("expected IllegalArgumentException")
        } catch (e: IllegalArgumentException) {
            assertTrue(e.message!!.contains("https"))
        }
    }

    @Test
    fun defaultEndpointsAreAllHttps() {
        assertTrue(DohClient.DEFAULT_ENDPOINTS.all { it.startsWith("https://") })
    }
}
