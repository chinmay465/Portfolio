package com.chinmay.swar.web

import org.junit.Assert.assertEquals
import org.junit.Test

class AudioQualityTest {

    @Test
    fun autoIsTheDefault() {
        assertEquals(AudioQuality.AUTO, AudioQuality.fromKey(null))
        assertEquals(AudioQuality.AUTO, AudioQuality.fromKey("lossless"))
        assertEquals(AudioQuality.HIGH, AudioQuality.fromKey("high"))
        assertEquals(AudioQuality.LOW, AudioQuality.fromKey("low"))
    }

    @Test
    fun scriptPrefixSetsThePageSetting() {
        assertEquals("window.__swarAudioQuality='high';\n", AudioQuality.HIGH.scriptPrefix)
        assertEquals("window.__swarAudioQuality='auto';\n", AudioQuality.AUTO.scriptPrefix)
    }
}
