package com.chinmay.swar.playback

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

    /** App left the screen: if a video is playing, switch to its song (audio-only) version. */
    data object EnterBackground : PlayerCommand {
        override val js = call("background")
    }

    /** App is back on screen: switch back to the video if Swar switched it to the song. */
    data object ReturnToForeground : PlayerCommand {
        override val js = call("foreground")
    }

    data class SeekTo(val positionMs: Long) : PlayerCommand {
        override val js = call("seek", (positionMs.coerceAtLeast(0) / 1000.0).toString())
    }
}

private fun call(name: String, arg: String = "null") =
    "window.__swar&&window.__swar.cmd&&window.__swar.cmd('$name',$arg);"
