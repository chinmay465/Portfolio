package com.chinmay.swar.web

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AdFilterTest {

    @Test
    fun blocksAdNetworksAndTheirSubdomains() {
        assertTrue(AdFilter.shouldBlock("https://googleads.g.doubleclick.net/pagead/id"))
        assertTrue(AdFilter.shouldBlock("https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"))
        assertTrue(AdFilter.shouldBlock("https://www.googleadservices.com/pagead/conversion/"))
        assertTrue(AdFilter.shouldBlock("https://imasdk.googleapis.com/js/sdkloader/ima3.js"))
    }

    @Test
    fun blocksAdEndpointsOnYoutubeHosts() {
        assertTrue(AdFilter.shouldBlock("https://www.youtube.com/api/stats/ads?ver=2&ns=1"))
        assertTrue(AdFilter.shouldBlock("https://music.youtube.com/pagead/viewthroughconversion/1"))
        assertTrue(AdFilter.shouldBlock("https://www.youtube.com/ptracking?pltype=content"))
        assertTrue(AdFilter.shouldBlock("https://music.youtube.com/youtubei/v1/player/ad_break?prettyPrint=false"))
    }

    @Test
    fun allowsPlaybackAndApiTraffic() {
        assertFalse(AdFilter.shouldBlock("https://music.youtube.com/"))
        assertFalse(AdFilter.shouldBlock("https://music.youtube.com/youtubei/v1/player?prettyPrint=false"))
        assertFalse(AdFilter.shouldBlock("https://music.youtube.com/youtubei/v1/next"))
        assertFalse(AdFilter.shouldBlock("https://rr3---sn-ab5l6nrz.googlevideo.com/videoplayback?expire=1&mime=audio%2Fwebm"))
        assertFalse(AdFilter.shouldBlock("https://lh3.googleusercontent.com/abc=w544-h544"))
        assertFalse(AdFilter.shouldBlock("https://accounts.google.com/ServiceLogin"))
    }

    @Test
    fun doesNotMatchLookalikeHosts() {
        assertFalse(AdFilter.shouldBlock("https://notdoubleclick.net/x"))
        assertFalse(AdFilter.shouldBlock("https://doubleclick.net.example.com/x"))
        assertFalse(AdFilter.shouldBlock("https://example.com/pagead/x"))
    }

    @Test
    fun handlesOddInput() {
        assertFalse(AdFilter.shouldBlock(""))
        assertFalse(AdFilter.shouldBlock("data:text/plain,hi"))
        assertFalse(AdFilter.shouldBlock("blob:https://music.youtube.com/1234"))
        assertTrue(AdFilter.shouldBlock("https://user@ad.doubleclick.net:443/x?a=|b"))
    }
}
