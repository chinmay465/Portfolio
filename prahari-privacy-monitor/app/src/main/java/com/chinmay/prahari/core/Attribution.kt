package com.chinmay.prahari.core

/**
 * Works out which app switched a sensor on when Android only says "the camera
 * is now in use". Since Android 11 a background app can only reach the camera
 * or mic from a foreground service, so the suspects are: the app on screen,
 * else the apps running foreground services, narrowed to those that hold the
 * permission.
 */
object Attribution {
    data class Result(val pkg: String?, val candidates: List<String>, val background: Boolean)

    fun attribute(
        foreground: String?,
        screenOff: Boolean,
        services: Set<String>,
        holds: (String) -> Boolean,
        ignore: Set<String> = emptySet(),
    ): Result {
        val fg = foreground?.takeIf { it !in ignore && holds(it) }
        if (!screenOff && fg != null) return Result(fg, listOf(fg), background = false)

        val bg = services.filter { it !in ignore && holds(it) }.sorted()
        return when {
            bg.size == 1 -> Result(bg[0], bg, background = true)
            bg.isEmpty() && fg != null -> Result(fg, listOf(fg), background = true)
            else -> Result(null, bg, background = true)
        }
    }
}
