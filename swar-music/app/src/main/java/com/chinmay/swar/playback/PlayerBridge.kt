package com.chinmay.swar.playback

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Connects the WebView (in MainActivity) with PlaybackService. The page
 * publishes its state here; the service sends commands back through
 * [commandSink], which MainActivity points at its WebView.
 */
object PlayerBridge {
    private val _state = MutableStateFlow(PlayerState())
    val state: StateFlow<PlayerState> = _state.asStateFlow()

    @Volatile
    var commandSink: ((PlayerCommand) -> Unit)? = null

    @Volatile
    var closeListener: (() -> Unit)? = null

    fun publish(state: PlayerState) {
        _state.value = state
    }

    private val _audio = MutableStateFlow("")

    /** What's playing, for the notification: "Opus · 128 kbps", or "" when unknown. */
    val audio: StateFlow<String> = _audio.asStateFlow()

    fun publishAudio(label: String) {
        _audio.value = label
    }

    fun send(command: PlayerCommand) {
        commandSink?.invoke(command)
    }

    fun requestClose() {
        closeListener?.invoke()
    }
}
