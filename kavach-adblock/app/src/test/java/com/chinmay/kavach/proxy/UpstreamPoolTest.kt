package com.chinmay.kavach.proxy

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UpstreamPoolTest {

    private fun entry(n: Int, latency: Int) = UpstreamPool.Entry(ProxyServer("10.0.0.$n", 8080), latency, "203.0.113.$n")

    @Test
    fun fastestFirstAndRotationWraps() {
        val pool = UpstreamPool()
        pool.replace(listOf(entry(1, 300), entry(2, 100), entry(3, 200)))
        assertEquals("10.0.0.2:8080", pool.current()!!.address)
        assertEquals(listOf("10.0.0.2:8080", "10.0.0.3:8080", "10.0.0.1:8080"), pool.attemptOrder().map { it.address })
        pool.rotate()
        assertEquals("10.0.0.3:8080", pool.current()!!.address)
        assertEquals(listOf("10.0.0.3:8080", "10.0.0.1:8080"), pool.attemptOrder(2).map { it.address })
        pool.rotate()
        pool.rotate()
        assertEquals("10.0.0.2:8080", pool.current()!!.address)
    }

    @Test
    fun dropsAProxyAfterTwoFailuresInARow() {
        val pool = UpstreamPool(maxFails = 2)
        pool.replace(listOf(entry(1, 100), entry(2, 200)))
        val first = pool.current()!!
        assertFalse(pool.reportFailure(first))
        pool.reportSuccess(first) // a success resets the count
        assertFalse(pool.reportFailure(first))
        assertTrue(pool.reportFailure(first))
        assertEquals(1, pool.size())
        assertEquals("10.0.0.2:8080", pool.current()!!.address)
        assertFalse(pool.reportFailure(first)) // already gone
    }

    @Test
    fun removingBeforeTheCurrentKeepsTheCurrent() {
        val pool = UpstreamPool(maxFails = 1)
        pool.replace(listOf(entry(1, 100), entry(2, 200), entry(3, 300)))
        val first = pool.current()!!
        pool.rotate()
        pool.rotate()
        assertEquals("10.0.0.3:8080", pool.current()!!.address)
        pool.reportFailure(first)
        assertEquals("10.0.0.3:8080", pool.current()!!.address)
    }

    @Test
    fun emptyPoolAndChangeCallbacks() {
        val pool = UpstreamPool(maxFails = 1)
        var changes = 0
        pool.onChange = { changes++ }
        assertNull(pool.current())
        assertNull(pool.rotate())
        assertTrue(pool.attemptOrder().isEmpty())
        pool.replace(listOf(entry(1, 100)))
        pool.addAll(listOf(entry(1, 50), entry(2, 80)))
        assertEquals(2, pool.size())
        pool.reportFailure(pool.current()!!)
        pool.reportFailure(pool.current()!!)
        assertEquals(0, pool.size())
        assertNull(pool.current())
        assertEquals(4, changes)
    }
}
