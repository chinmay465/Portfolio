package com.chinmay.kavach.proxy

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ProxyCheckerTest {

    @Test
    fun readsExitIpFromCloudflareTrace() {
        val body = "fl=123\nh=1.1.1.1\nip=203.0.113.7\nts=1732400000.1\nvisit_scheme=https\n"
        assertEquals("203.0.113.7", ProxyChecker.parseTraceIp(body))
        assertEquals("2001:db8::7", ProxyChecker.parseTraceIp("ip=2001:db8::7\n"))
        assertNull(ProxyChecker.parseTraceIp("fl=1\nh=x\n"))
        assertNull(ProxyChecker.parseTraceIp("ip=\n"))
    }
}
