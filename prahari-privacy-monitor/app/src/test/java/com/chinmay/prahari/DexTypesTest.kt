package com.chinmay.prahari

import com.chinmay.prahari.apps.DexTypes
import com.chinmay.prahari.apps.TrackerSdks
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DexTypesTest {

    /** A minimal dex: header, string_ids, type_ids and string data. */
    private fun dex(types: List<String>): ByteArray {
        val n = types.size
        val stringIdsOff = 0x70
        val typeIdsOff = stringIdsOff + 4 * n
        val dataStart = typeIdsOff + 4 * n
        val data = java.io.ByteArrayOutputStream()
        val offsets = IntArray(n)
        types.forEachIndexed { i, t ->
            offsets[i] = dataStart + data.size()
            var len = t.length
            do {
                var b = len and 0x7F
                len = len ushr 7
                if (len != 0) b = b or 0x80
                data.write(b)
            } while (len != 0)
            data.write(t.toByteArray(Charsets.US_ASCII))
            data.write(0)
        }
        val out = ByteArray(dataStart + data.size())
        "dex\n035\u0000".toByteArray(Charsets.US_ASCII).copyInto(out)
        fun put(i: Int, v: Int) {
            out[i] = v.toByte(); out[i + 1] = (v ushr 8).toByte(); out[i + 2] = (v ushr 16).toByte(); out[i + 3] = (v ushr 24).toByte()
        }
        put(0x38, n); put(0x3C, stringIdsOff); put(0x40, n); put(0x44, typeIdsOff)
        for (i in 0 until n) {
            put(stringIdsOff + 4 * i, offsets[i])
            put(typeIdsOff + 4 * i, i)
        }
        data.toByteArray().copyInto(out, dataStart)
        return out
    }

    @Test
    fun readsClassDescriptors() {
        val seen = ArrayList<String>()
        DexTypes.forEach(dex(listOf("Lcom/example/Main;", "I", "[Ljava/lang/String;", "Lcom/appsflyer/AppsFlyerLib;"))) { seen += it }
        assertEquals(listOf("Lcom/example/Main;", "Lcom/appsflyer/AppsFlyerLib;"), seen)
    }

    @Test
    fun findsTrackersAndIgnoresLookalikes() {
        val found = DexTypes.trackersIn(
            dex(
                listOf(
                    "Lcom/uxcam/UXCam;",
                    "Lio/sentry/android/replay/ReplayIntegration;",
                    "Lio/sentry/Sentry;",
                    "Lcom/facebook/react/ReactActivity;", // React Native is not Meta's tracker
                    "Lcom/clevertap/android/sdk/CleverTapAPI;",
                    "Lcom/example/appsflyerish/Thing;",
                ),
            ),
        )
        assertEquals(setOf("uxcam", "sentry_replay", "sentry", "clevertap"), found)
    }

    @Test
    fun rejectsGarbage() {
        val seen = ArrayList<String>()
        DexTypes.forEach(ByteArray(10)) { seen += it }
        DexTypes.forEach(ByteArray(0x200)) { seen += it }
        val broken = dex(listOf("Lcom/a/B;")).also { it[0x45] = 0x7F } // type_ids offset past the end
        DexTypes.forEach(broken) { seen += it }
        assertTrue(seen.isEmpty())
    }

    @Test
    fun deepestPrefixWins() {
        assertEquals("datadog_replay", TrackerSdks.match("Lcom/datadog/android/sessionreplay/SessionReplay;")?.id)
        assertEquals("datadog", TrackerSdks.match("Lcom/datadog/android/Datadog;")?.id)
        assertEquals("admob", TrackerSdks.match("Lcom/google/android/gms/ads/AdView;")?.id)
        assertNull(TrackerSdks.match("Lcom/google/android/gms/maps/MapView;"))
        assertNull(TrackerSdks.match("I"))
    }

    @Test
    fun resolveOrdersMostInvasiveFirst() {
        val ids = TrackerSdks.resolve(listOf("crashlytics", "uxcam", "admob", "unknown"))
        assertEquals(listOf("uxcam", "admob", "crashlytics"), ids.map { it.id })
    }
}
