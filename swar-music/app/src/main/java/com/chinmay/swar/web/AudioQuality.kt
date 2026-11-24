package com.chinmay.swar.web

import android.content.Context

/** Swar's Audio quality setting, applied by the page script (swar.js, section 2b). */
enum class AudioQuality(val key: String) {
    /** YouTube Music's own adaptive choice. */
    AUTO("auto"),

    /** Always the highest bitrate YouTube offers the account for each song. */
    HIGH("high"),

    /** Always the lowest bitrate, to save data. */
    LOW("low");

    /** Runs right before swar.js, so the first song of a page load already uses it. */
    val scriptPrefix: String get() = "window.__swarAudioQuality='$key';\n"

    companion object {
        private const val PREFS = "swar"
        private const val KEY = "audio_quality"

        fun fromKey(key: String?): AudioQuality = entries.firstOrNull { it.key == key } ?: AUTO

        fun load(context: Context): AudioQuality =
            fromKey(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null))

        fun save(context: Context, quality: AudioQuality) {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, quality.key).apply()
        }
    }
}
