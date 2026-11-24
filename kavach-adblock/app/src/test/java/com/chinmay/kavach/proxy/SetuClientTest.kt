package com.chinmay.kavach.proxy

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SetuClientTest {

    @Test
    fun parsesPoolInSetuOrderAndSkipsJunk() {
        val json = """
            {"alive": 4, "proxies": [
              {"id": "1.2.3.4:8080", "address": "1.2.3.4:8080", "latencyMs": 210, "exitIp": "1.2.3.4"},
              {"address": "5.6.7.8:3128", "latencyMs": 480},
              {"address": "5.6.7.8:3128", "latencyMs": 500},
              {"address": "999.1.1.1:80"},
              {"address": "9.9.9.9:70000"},
              {"address": "example.com:80"},
              {"address": "10.0.0.1:8000"}
            ]}
        """.trimIndent()
        val pool = SetuClient.parsePool(json)
        assertEquals(listOf("1.2.3.4:8080", "5.6.7.8:3128", "10.0.0.1:8000"), pool.map { it.address })
        assertEquals(210, pool[0].setuLatencyMs)
        assertEquals(0, pool[2].setuLatencyMs)
    }

    @Test
    fun emptyOrMissingProxiesGivesEmptyList() {
        assertTrue(SetuClient.parsePool("""{"alive": 0, "proxies": []}""").isEmpty())
        assertTrue(SetuClient.parsePool("""{"refreshing": true}""").isEmpty())
    }

    @Test
    fun normalizesUrlsAndRequiresHttps() {
        assertEquals("https://setu-proxy-hub.onrender.com", SetuClient.normalizeUrl(" https://setu-proxy-hub.onrender.com/ "))
        assertEquals("https://my.host:8443/setu", SetuClient.normalizeUrl("https://my.host:8443/setu"))
        assertNull(SetuClient.normalizeUrl("http://setu-proxy-hub.onrender.com"))
        assertNull(SetuClient.normalizeUrl("setu-proxy-hub.onrender.com"))
        assertNull(SetuClient.normalizeUrl("https://"))
    }
}
