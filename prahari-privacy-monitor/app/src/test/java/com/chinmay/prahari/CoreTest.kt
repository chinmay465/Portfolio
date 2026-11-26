package com.chinmay.prahari

import com.chinmay.prahari.apps.Exposure
import com.chinmay.prahari.apps.Perm
import com.chinmay.prahari.apps.TrackerSdks
import com.chinmay.prahari.canary.LogcatLine
import com.chinmay.prahari.core.Access
import com.chinmay.prahari.core.Attribution
import com.chinmay.prahari.core.Confidence
import com.chinmay.prahari.core.Kind
import com.chinmay.prahari.core.Risk
import com.chinmay.prahari.core.Source
import com.chinmay.prahari.net.TrackerDomains
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AttributionTest {
    private val holders = setOf("com.cam", "com.rec", "com.call")

    @Test
    fun appOnScreenWithPermissionIsLikely() {
        val r = Attribution.attribute("com.cam", screenOff = false, services = setOf("com.rec"), holds = { it in holders })
        assertEquals("com.cam", r.pkg)
        assertFalse(r.background)
    }

    @Test
    fun appOnScreenWithoutPermissionPointsAtBackgroundService() {
        val r = Attribution.attribute("com.browser", screenOff = false, services = setOf("com.rec", "com.music"), holds = { it in holders })
        assertEquals("com.rec", r.pkg)
        assertTrue(r.background)
    }

    @Test
    fun severalSuspectsAreListed() {
        val r = Attribution.attribute(null, screenOff = true, services = setOf("com.rec", "com.call"), holds = { it in holders })
        assertNull(r.pkg)
        assertEquals(listOf("com.call", "com.rec"), r.candidates)
        assertTrue(r.background)
    }

    @Test
    fun screenOffIsAlwaysBackground() {
        val r = Attribution.attribute("com.cam", screenOff = true, services = emptySet(), holds = { it in holders })
        assertEquals("com.cam", r.pkg)
        assertTrue(r.background)
    }

    @Test
    fun ignoredPackagesNeverBlamed() {
        val r = Attribution.attribute("com.chinmay.prahari", false, setOf("com.chinmay.prahari"), { true }, ignore = setOf("com.chinmay.prahari"))
        assertNull(r.pkg)
        assertTrue(r.candidates.isEmpty())
    }

    @Test
    fun confidenceFollowsSource() {
        val base = Access(kind = Kind.MIC, pkg = "a", candidates = listOf("a"), start = 0, end = 1, screenOff = false, background = false, source = Source.LIVE)
        assertEquals(Confidence.LIKELY, base.confidence)
        assertEquals(Confidence.EXACT, base.copy(source = Source.OPS).confidence)
        assertEquals(Confidence.POSSIBLE, base.copy(pkg = null, candidates = listOf("a", "b"), background = true).confidence)
        assertEquals(Confidence.UNKNOWN, base.copy(pkg = null, candidates = emptyList()).confidence)
    }
}

class RiskTest {
    @Test
    fun quietAppIsLow() {
        val r = Risk.score(Risk.Input(granted = setOf(Perm.NOTIFICATIONS)))
        assertEquals(Risk.Level.LOW, r.level)
        assertEquals(0, r.score)
    }

    @Test
    fun backgroundCameraAndReplayIsHigh() {
        val r = Risk.score(
            Risk.Input(
                granted = setOf(Perm.CAMERA, Perm.MIC),
                trackers = TrackerSdks.resolve(listOf("uxcam")),
                bgSensorUses = 3,
            ),
        )
        assertEquals(Risk.Level.HIGH, r.level)
        assertTrue(r.reasons.first().behaviour)
        assertTrue(r.reasons.any { it.text.contains("UXCam") })
    }

    @Test
    fun keyboardThatReadsScreenIsHigh() {
        val r = Risk.score(Risk.Input(exposure = Exposure(keyboard = true, defaultKeyboard = true, accessibility = true, readsScreen = true)))
        assertEquals(Risk.Level.HIGH, r.level)
    }

    @Test
    fun systemAppsWeighCapabilityLess() {
        val input = Risk.Input(granted = setOf(Perm.SMS, Perm.CALL_LOG, Perm.CONTACTS, Perm.LOCATION_BACKGROUND))
        assertTrue(Risk.score(input.copy(system = true)).score < Risk.score(input).score)
    }

    @Test
    fun heavyBackgroundUploadFromUnusedApp() {
        val r = Risk.score(Risk.Input(bgUploadBytes = 80L shl 20, screenMinutes = 2))
        assertTrue(r.reasons.single().text.startsWith("Sent 80 MB"))
    }

    @Test
    fun scoreIsCapped() {
        val r = Risk.score(
            Risk.Input(
                granted = Perm.entries.toSet(),
                exposure = Exposure(true, true, true, true, true, true, true, true, true),
                trackers = TrackerSdks.ALL,
                bgSensorUses = 50, bgClipboard = 50, bgLocation = 500,
                bgUploadBytes = 1L shl 33, trackerDomains = 40,
            ),
        )
        assertEquals(100, r.score)
    }
}

class TrackerDomainsTest {
    @Test
    fun matchesSubdomains() {
        assertEquals("AppsFlyer", TrackerDomains.lookup("t.appsflyer.com")?.company)
        assertEquals("CleverTap", TrackerDomains.lookup("in1.clevertap-prod.com.")?.company)
        assertNotNull(TrackerDomains.lookup("APP-MEASUREMENT.COM"))
    }

    @Test
    fun doesNotMatchLookalikes() {
        assertNull(TrackerDomains.lookup("notappsflyer.com"))
        assertNull(TrackerDomains.lookup("com"))
        assertNull(TrackerDomains.lookup("music.youtube.com"))
        assertNull(TrackerDomains.lookup("googleapis.com"))
    }
}

class LogcatLineTest {
    @Test
    fun parsesUidFormat() {
        val l = LogcatLine.parse("11-26 22:35:01.123  u0_a245  4021  4100 D SearchFragment: query=zqkatmvrp")!!
        assertEquals(10245, l.uid)
        assertEquals("SearchFragment", l.tag)
        assertEquals("query=zqkatmvrp", l.message)
        assertEquals('D', l.level)
    }

    @Test
    fun parsesNumericAndNamedUids() {
        assertEquals(10123, LogcatLine.parse("01-02 03:04:05.678 10123 1 2 I Tag: m")!!.uid)
        assertEquals(1000, LogcatLine.parse("01-02 03:04:05.678 system 1 2 W ActivityManager: m")!!.uid)
        assertEquals(1_010_005, LogcatLine.uidOf("u10_a5"))
    }

    @Test
    fun parsesWithoutUid() {
        val l = LogcatLine.parse("01-02 03:04:05.678  1234  1250 E chromium: [ERROR] boom")!!
        assertNull(l.uid)
        assertEquals("chromium", l.tag)
    }

    @Test
    fun ignoresHeaders() {
        assertNull(LogcatLine.parse("--------- beginning of main"))
    }
}
