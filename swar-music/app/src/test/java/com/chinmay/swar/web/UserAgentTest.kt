package com.chinmay.swar.web

import org.junit.Assert.assertEquals
import org.junit.Test

class UserAgentTest {

    @Test
    fun turnsWebViewUserAgentIntoChromeReducedUserAgent() {
        val webView = "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Version/4.0 Chrome/131.0.6778.135 Mobile Safari/537.36"
        assertEquals(
            "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
            UserAgent.chromeLike(webView),
        )
    }

    @Test
    fun leavesChromeUserAgentAsIs() {
        val chrome = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"
        assertEquals(chrome, UserAgent.chromeLike(chrome))
    }
}
