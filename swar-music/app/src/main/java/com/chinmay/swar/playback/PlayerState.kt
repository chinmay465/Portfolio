package com.chinmay.swar.playback

/** What the page reports as playing. Sent by assets/swar.js about once a second. */
data class PlayerState(
    val title: String = "",
    val artist: String = "",
    val album: String = "",
    val artworkUrl: String = "",
    val playing: Boolean = false,
    val durationMs: Long = 0,
    val positionMs: Long = 0,
    val inAd: Boolean = false,
)
