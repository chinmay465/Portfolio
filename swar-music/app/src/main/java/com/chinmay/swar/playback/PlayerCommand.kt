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

    /** App left the screen: make sure nothing is playing as video (switch to the song version). */
    data object EnterBackground : PlayerCommand {
        override val js = call("background")
    }

    /** Back pressed with the now-playing page open: minimise it. Evaluates to true if it did. */
    data object CollapsePlayer : PlayerCommand {
        override val js = call("collapse")
    }

    data class SeekTo(val positionMs: Long) : PlayerCommand {
        override val js = call("seek", (positionMs.coerceAtLeast(0) / 1000.0).toString())
    }
}

private fun call(name: String, arg: String = "null") =
    "window.__swar&&window.__swar.cmd&&window.__swar.cmd('$name',$arg);"
