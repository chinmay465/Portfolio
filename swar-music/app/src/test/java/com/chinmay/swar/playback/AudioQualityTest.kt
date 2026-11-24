package com.chinmay.swar.playback

import com.chinmay.swar.playback.AudioQuality.Candidate
import org.junit.Assert.assertEquals
import org.junit.Test

class AudioQualityTest {
    // itag 249/250/251 (Opus 52/68/131 kbps), 139/140 (AAC 48/129 kbps)
    private val offer = listOf(Candidate(52, true), Candidate(68, true), Candidate(131, true), Candidate(48, false), Candidate(129, false))

    @Test
    fun highTakesTheBest() = assertEquals(2, AudioQuality.HIGH.pick(offer, metered = true))

    @Test
    fun lowTakesTheLightest() = assertEquals(3, AudioQuality.LOW.pick(offer, metered = false))

    @Test
    fun normalStaysUnderTheCap() {
        assertEquals(2, AudioQuality.NORMAL.pick(offer, metered = false))
        val premium = offer + Candidate(256, false)
        assertEquals(2, AudioQuality.NORMAL.pick(premium, metered = false))
        assertEquals(5, AudioQuality.HIGH.pick(premium, metered = false))
    }

    @Test
    fun autoFollowsTheConnection() {
        val premium = offer + Candidate(256, false)
        assertEquals(5, AudioQuality.AUTO.pick(premium, metered = false))
        assertEquals(2, AudioQuality.AUTO.pick(premium, metered = true))
    }

    @Test
    fun nothingOnOffer() = assertEquals(-1, AudioQuality.HIGH.pick(emptyList(), metered = false))

    @Test
    fun keys() {
        assertEquals(AudioQuality.LOW, AudioQuality.fromKey("low"))
        assertEquals(AudioQuality.AUTO, AudioQuality.fromKey(null))
    }
}
