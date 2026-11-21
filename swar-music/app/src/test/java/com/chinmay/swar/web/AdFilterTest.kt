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
    fun blocksTelemetry() {
        assertTrue(AdFilter.shouldBlock("https://music.youtube.com/youtubei/v1/log_event?alt=json"))
        assertTrue(AdFilter.shouldBlock("https://music.youtube.com/api/stats/qoe?fmt=251&cpn=x"))
        assertTrue(AdFilter.shouldBlock("https://music.youtube.com/csi_204?v=3&s=youtube_music"))
        assertTrue(AdFilter.shouldBlock("https://www.youtube.com/error_204?a=logerror"))
        assertTrue(AdFilter.shouldBlock("https://music.youtube.com/gen_204?a=x"))
        assertTrue(AdFilter.shouldBlock("https://play.google.com/log?format=json&hasfast=true"))
        assertTrue(AdFilter.shouldBlock("https://www.google.com/log?format=json"))
        assertTrue(AdFilter.shouldBlock("https://www.google-analytics.com/g/collect?v=2"))
        assertTrue(AdFilter.shouldBlock("https://firebaselogging-pa.googleapis.com/v1/firelog/legacy/batchlog"))
    }

    @Test
    fun keepsWhatPlaybackAndSignInNeed() {
        // History pings: kept so recommendations keep working (see AdFilter docs).
        assertFalse(AdFilter.shouldBlock("https://music.youtube.com/api/stats/playback?ns=yt&el=detailpage"))
        assertFalse(AdFilter.shouldBlock("https://music.youtube.com/api/stats/watchtime?ns=yt"))
        // Bot-check / attestation that YouTube requires before it serves audio.
        assertFalse(AdFilter.shouldBlock("https://music.youtube.com/youtubei/v1/att/get"))
        assertFalse(AdFilter.shouldBlock("https://jnn-pa.googleapis.com/\$rpc/google.internal.waa.v1.Waa/GenerateIT"))
        assertFalse(AdFilter.shouldBlock("https://www.google.com/js/th/abc.js"))
        assertFalse(AdFilter.shouldBlock("https://www.google.com/logos/doodles/2026/x.png"))
        assertFalse(AdFilter.shouldBlock("https://play.google.com/store/apps"))
        assertFalse(AdFilter.shouldBlock("https://accounts.google.com/v3/signin/identifier"))
        assertFalse(AdFilter.shouldBlock("https://rr1---sn-ab5l6nrz.googlevideo.com/generate_204"))
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
