package com.chinmay.swar.playback

/** Swar's Audio quality setting. */
enum class AudioQuality(val key: String, val label: String, val detail: String) {
    AUTO("auto", "Auto", "High on Wi-Fi, Normal on mobile data"),
    HIGH("high", "High", "The best audio YouTube offers for each song"),
    NORMAL("normal", "Normal", "Up to about 128 kbps"),
    LOW("low", "Low", "Saves data");

    /** One audio stream on offer: bitrate in kbps and whether it's Opus (better per bit than AAC). */
    data class Candidate(val kbps: Int, val opus: Boolean)

    /** Index into [candidates] of the stream to play, or -1 if there are none. */
    fun pick(candidates: List<Candidate>, metered: Boolean): Int {
        if (candidates.isEmpty()) return -1
        val effective = if (this == AUTO) (if (metered) NORMAL else HIGH) else this
        val order = compareBy<IndexedValue<Candidate>>({ it.value.kbps }, { if (it.value.opus) 1 else 0 })
        val indexed = candidates.withIndex().toList()
        return when (effective) {
            HIGH -> indexed.maxWith(order).index
            LOW -> indexed.minWithOrNull(compareBy({ it.value.kbps }, { if (it.value.opus) 0 else 1 }))!!.index
            else -> indexed.filter { it.value.kbps <= NORMAL_CAP_KBPS }.maxWithOrNull(order)?.index
                ?: indexed.minWith(compareBy { it.value.kbps }).index
        }
    }

    companion object {
        /** YouTube's "Normal" tier tops out around 128 kbps; Opus streams report a little more. */
        const val NORMAL_CAP_KBPS = 140

        fun fromKey(key: String?): AudioQuality = entries.firstOrNull { it.key == key } ?: AUTO
    }
}
