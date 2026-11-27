package com.chinmay.bachat.core

data class Platform(
    val id: String,
    val name: String,
    val group: String,
    val color: Long,
    val names: List<String>,
    val domains: List<String>,
    val beats: List<String>,
)

data class SourceDef(
    val id: String,
    val kind: String, // "telegram" | "rss"
    val name: String,
    val enabled: Boolean,
    val channel: String? = null,
    val url: String? = null,
    val note: String? = null,
)

/** The store list and default sources, read from the JSON shared with the web app (shared/data). */
class Catalog(platformsJson: String, sourcesJson: String) {
    val platforms: List<Platform> = Json.parse(platformsJson).obj()["platforms"].list().map {
        val m = it.obj()
        Platform(
            id = m.str("id")!!,
            name = m.str("name")!!,
            group = m.str("group") ?: "other",
            color = 0xFF000000 or m.str("color")!!.removePrefix("#").toLong(16),
            names = m["names"].list().map { n -> n as String },
            domains = m["domains"].list().map { d -> d as String },
            beats = m["beats"].list().map { b -> b as String },
        )
    }
    val sources: List<SourceDef> = Json.parse(sourcesJson).obj()["sources"].list().map {
        val m = it.obj()
        SourceDef(m.str("id")!!, m.str("kind")!!, m.str("name")!!, m.bool("enabled") ?: true, m.str("channel"), m.str("url"), m.str("note"))
    }

    fun platform(id: String): Platform = platforms.firstOrNull { it.id == id } ?: platforms.last()
}

enum class Kind(val json: String) {
    PERCENT("percent"), PRICE("price"), FLAT("flat"), BOGO("bogo"), FREE("free");

    companion object {
        fun of(s: String?) = entries.firstOrNull { it.json == s }
    }
}

data class DiscountInfo(
    val percent: Int?,
    val kind: Kind?,
    val upTo: Boolean,
    val price: Double?,
    val mrp: Double?,
    val priceError: Boolean,
    val loot: Boolean,
)

data class RawPost(
    val id: String,
    val text: String,
    val links: List<String>,
    val postUrl: String,
    val postedAt: Long,
    val image: String?,
)

data class Deal(
    val id: String,
    val source: String,
    val sourceName: String,
    val title: String,
    val text: String,
    val url: String,
    val postUrl: String,
    val image: String?,
    val postedAt: Long,
    val firstSeen: Long,
    val platform: String,
    val d: DiscountInfo,
) {
    val percent get() = d.percent

    fun toMap(): Map<String, Any?> = linkedMapOf(
        "id" to id, "source" to source, "sourceName" to sourceName, "title" to title, "text" to text,
        "url" to url, "postUrl" to postUrl, "image" to image, "postedAt" to postedAt, "firstSeen" to firstSeen,
        "platform" to platform, "percent" to d.percent, "kind" to d.kind?.json, "upTo" to d.upTo,
        "price" to d.price, "mrp" to d.mrp, "priceError" to d.priceError, "loot" to d.loot,
    )

    companion object {
        fun from(m: Map<String, Any?>) = Deal(
            id = m.str("id")!!, source = m.str("source") ?: "", sourceName = m.str("sourceName") ?: "",
            title = m.str("title") ?: "", text = m.str("text") ?: "", url = m.str("url") ?: "",
            postUrl = m.str("postUrl") ?: "", image = m.str("image"),
            postedAt = m.num("postedAt")?.toLong() ?: 0L, firstSeen = m.num("firstSeen")?.toLong() ?: 0L,
            platform = m.str("platform") ?: "other",
            d = DiscountInfo(
                percent = m.num("percent")?.toInt(), kind = Kind.of(m.str("kind")), upTo = m.bool("upTo") ?: false,
                price = m.num("price"), mrp = m.num("mrp"), priceError = m.bool("priceError") ?: false, loot = m.bool("loot") ?: false,
            ),
        )
    }
}

data class Extraordinary(val enabled: Boolean = true, val threshold: Int = 90, val anyPlatform: Boolean = true)
data class Quiet(val enabled: Boolean = false, val from: Int = 23, val to: Int = 7)

/** Same rules and defaults as shared/types.ts. */
data class Settings(
    val minDiscount: Int = 60,
    val platforms: Map<String, Boolean> = emptyMap(),
    val agesNow: Boolean = true,
    val agesEarlier: Boolean = false,
    val nowHours: Int = 3,
    val includeUpTo: Boolean = true,
    val includeNoDiscount: Boolean = false,
    val extraordinary: Extraordinary = Extraordinary(),
    val keywords: List<String> = emptyList(),
    val muted: List<String> = emptyList(),
    val quiet: Quiet = Quiet(),
    val channels: List<String> = emptyList(),
    /** Android only: minutes between background checks (15 is Android's minimum). */
    val intervalMinutes: Int = 15,
) {
    fun platformOn(id: String) = platforms[id] ?: (id != "other")

    fun toMap(): Map<String, Any?> = linkedMapOf(
        "minDiscount" to minDiscount, "platforms" to platforms,
        "ages" to mapOf("now" to agesNow, "earlier" to agesEarlier), "nowHours" to nowHours,
        "includeUpTo" to includeUpTo, "includeNoDiscount" to includeNoDiscount,
        "extraordinary" to mapOf("enabled" to extraordinary.enabled, "threshold" to extraordinary.threshold, "anyPlatform" to extraordinary.anyPlatform),
        "keywords" to keywords, "muted" to muted,
        "quiet" to mapOf("enabled" to quiet.enabled, "from" to quiet.from, "to" to quiet.to),
        "channels" to channels, "intervalMinutes" to intervalMinutes,
    )

    companion object {
        private fun clamp(v: Double?, lo: Int, hi: Int, d: Int) = v?.let { Math.round(it).toInt().coerceIn(lo, hi) } ?: d
        private fun words(v: Any?) = v.list().filterIsInstance<String>().map { it.trim().lowercase() }.filter { it.isNotEmpty() }.distinct().take(30)

        fun from(input: Any?): Settings {
            val m = input.obj()
            val d = Settings()
            val ages = m["ages"].obj()
            val ex = m["extraordinary"].obj()
            val q = m["quiet"].obj()
            return Settings(
                minDiscount = clamp(m.num("minDiscount"), 0, 95, d.minDiscount),
                platforms = m["platforms"].obj().mapNotNull { (k, v) -> (v as? Boolean)?.let { k to it } }.toMap(),
                agesNow = ages.bool("now") ?: d.agesNow,
                agesEarlier = ages.bool("earlier") ?: d.agesEarlier,
                nowHours = clamp(m.num("nowHours"), 1, 48, d.nowHours),
                includeUpTo = m.bool("includeUpTo") ?: d.includeUpTo,
                includeNoDiscount = m.bool("includeNoDiscount") ?: d.includeNoDiscount,
                extraordinary = Extraordinary(
                    ex.bool("enabled") ?: true,
                    clamp(ex.num("threshold"), 50, 100, 90),
                    ex.bool("anyPlatform") ?: true,
                ),
                keywords = words(m["keywords"]),
                muted = words(m["muted"]),
                quiet = Quiet(q.bool("enabled") ?: false, clamp(q.num("from"), 0, 23, 23), clamp(q.num("to"), 0, 23, 7)),
                channels = m["channels"].list().filterIsInstance<String>().mapNotNull { cleanChannel(it) }.distinct().take(10),
                intervalMinutes = clamp(m.num("intervalMinutes"), 15, 360, 15),
            )
        }

        private val CHANNEL = Regex("""^(?:@|(?:https?://)?(?:www\.)?t(?:elegram)?\.me/(?:s/)?)?([A-Za-z][A-Za-z0-9_]{3,31})/?$""")
        fun cleanChannel(raw: String): String? = CHANNEL.find(raw.trim())?.groupValues?.get(1)
    }
}
