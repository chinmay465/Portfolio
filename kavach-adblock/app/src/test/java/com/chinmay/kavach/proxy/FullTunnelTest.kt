package com.chinmay.kavach.proxy

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FullTunnelTest {

    private fun toLong(ip: String) = ip.split('.').fold(0L) { acc, p -> (acc shl 8) or p.toLong() }

    private fun covered(routes: List<Pair<String, Int>>, ip: String): Boolean {
        val v = toLong(ip)
        return routes.any { (start, prefix) ->
            val s = toLong(start)
            v >= s && v <= s + (1L shl (32 - prefix)) - 1
        }
    }

    @Test
    fun routesEverythingExceptLocalAndPrivate() {
        val routes = FullTunnel.ROUTES_V4
        listOf("8.8.8.8", "142.250.183.4", "1.1.1.1", "100.64.0.5", "198.18.0.2", "223.255.255.255", "11.0.0.1")
            .forEach { assertTrue(it, covered(routes, it)) }
        listOf("10.1.2.3", "192.168.1.1", "172.16.0.1", "172.31.255.255", "127.0.0.1", "169.254.1.1", "224.0.0.251", "0.1.2.3")
            .forEach { assertFalse(it, covered(routes, it)) }
        // Blocks don't overlap.
        val sizes = routes.sumOf { 1L shl (32 - it.second) }
        val excluded = (1L shl 24) * 3 + (1L shl 16) * 2 + (1L shl 20) + (1L shl 29)
        assertEquals((1L shl 32) - excluded, sizes)
    }

    @Test
    fun complementOfNothingIsEverything() {
        assertEquals(listOf("0.0.0.0" to 0), Cidr.complement(emptyList()))
        assertEquals(listOf("128.0.0.0" to 1), Cidr.complement(listOf("0.0.0.0/1")))
    }

    @Test
    fun configPointsTheEngineAtKavachsProxy() {
        val yml = FullTunnel.config(28283)
        assertTrue(yml.contains("port: 28283"))
        assertTrue(yml.contains("address: 127.0.0.1"))
        assertTrue(yml.contains("mapdns:"))
        assertTrue(yml.contains("address: ${FullTunnel.DNS}"))
    }
}
