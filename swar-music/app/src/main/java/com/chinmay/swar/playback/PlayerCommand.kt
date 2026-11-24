package com.chinmay.swar.playback

import com.chinmay.swar.web.AudioQuality

/** Commands from the notification, lock screen or headset, run as JavaScript in the page. */
sealed interface PlayerCommand {
    val js: String

    data object Play : PlayerCommand {
        override val js = call("play")
    }

    data object Pause : PlayerCommand {
        override val js = call("pause")
    }

    data object Next : PlayerCommand {
        override val js = call("next")
    }

    data object Previous : PlayerCommand {
        override val js = call("prev")
    }

    /** App left the screen: make sure nothing is playing as video (switch to the song version). */
    data object EnterBackground : PlayerCommand {
        override val js = call("background")
    }

    /** Back on screen: the quality chip needs the player-page check again. */
    data object EnterForeground : PlayerCommand {
        override val js = call("foreground")
    }

    data class SeekTo(val positionMs: Long) : PlayerCommand {
        override val js = call("seek", (positionMs.coerceAtLeast(0) / 1000.0).toString())
    }

    data class SetAudioQuality(val quality: AudioQuality) : PlayerCommand {
        override val js = call("quality", "'${quality.key}'")
    }
}

private fun call(name: String, arg: String = "null") =
    "window.__swar&&window.__swar.cmd&&window.__swar.cmd('$name',$arg);"
