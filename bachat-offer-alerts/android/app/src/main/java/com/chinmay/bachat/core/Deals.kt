package com.chinmay.bachat.core

// Port of shared/deal.ts.

enum class Tier { EXTRAORDINARY, NORMAL }

data class Match(val notify: Boolean, val matches: Boolean, val tier: Tier?, val reason: String)

object Deals {
    private val NOT_STORE = Regex(
        """^https?://(?:[a-z0-9-]+\.)*(?:t\.me|telegram\.(?:me|org)|telesco\.pe|reddit\.com|redd\.it|whatsapp\.com|wa\.me|instagram\.com|youtube\.com|youtu\.be|x\.com|twitter\.com)(?:[/?#]|$)""",
        RegexOption.IGNORE_CASE,
    )
    val ONLY_DISCOUNT = Regex("""^(?:flat|upto|up to|extra|get)?\s*\d{1,3}\s*%\s*(?:off|discount|cashback)?\s*[!.]*$""", RegexOption.IGNORE_CASE)
    private val LEAD = Regex("""^[^\p{L}\p{N}₹\[(]+""")
    private val LETTER = Regex("""\p{L}""")

    fun stripLead(line: String) = LEAD.replace(line, "")

    fun titleOf(text: String): String {
        var fallback = ""
        for (raw in text.split('\n')) {
            val line = stripLead(raw.replace("~~", "")).trim()
            if (!LETTER.containsMatchIn(line) || line.startsWith("http://", true) || line.startsWith("https://", true)) continue
            if (ONLY_DISCOUNT.matches(line)) {
                if (fallback.isEmpty()) fallback = line
                continue
            }
            return if (line.length > 120) line.substring(0, 117).trimEnd() + "…" else line
        }
        return fallback.ifEmpty { text.take(120) }
    }

    fun toDeal(catalog: Catalog, post: RawPost, sourceId: String, sourceName: String, now: Long = System.currentTimeMillis()): Deal {
        val store = post.links.firstOrNull { !NOT_STORE.containsMatchIn(it) }
        return Deal(
            id = "$sourceId:${post.id}",
            source = sourceId,
            sourceName = sourceName,
            title = titleOf(post.text),
            text = if (post.text.length > 700) post.text.substring(0, 697) + "…" else post.text,
            url = store ?: post.postUrl,
            postUrl = post.postUrl,
            image = post.image,
            postedAt = post.postedAt,
            firstSeen = now,
            platform = Platforms.detect(catalog, post.text, post.links),
            d = Discount.extract(post.text),
        )
    }

    fun isNow(deal: Deal, nowHours: Int, now: Long) = now - deal.postedAt <= nowHours * 3_600_000L

    private fun quietNow(q: Quiet, hour: Int): Boolean {
        if (!q.enabled || q.from == q.to) return false
        return if (q.from < q.to) hour >= q.from && hour < q.to else hour >= q.from || hour < q.to
    }

    private fun contains(text: String, words: List<String>): String? {
        val t = text.lowercase()
        return words.firstOrNull { t.contains(it) }
    }

    /** Same rules as matchDeal in shared/deal.ts. */
    fun match(deal: Deal, s: Settings, now: Long, localHour: Int): Match {
        fun no(reason: String) = Match(false, false, null, reason)
        contains(deal.text, s.muted)?.let { return no("mentions “$it”, which you muted") }

        val fresh = isNow(deal, s.nowHours, now)
        if (fresh && !s.agesNow) return no("offers posted now are switched off")
        if (!fresh && !s.agesEarlier) return no("posted more than ${s.nowHours} h ago")

        val platformOn = s.platformOn(deal.platform)
        if (s.extraordinary.enabled && Discount.isExtraordinary(deal.d, s.extraordinary.threshold) && (s.extraordinary.anyPlatform || platformOn)) {
            return Match(true, true, Tier.EXTRAORDINARY, if (deal.d.priceError) "price error" else "${deal.percent}% off")
        }
        if (!platformOn) return no("store switched off")
        if (s.keywords.isNotEmpty() && contains(deal.text, s.keywords) == null) return no("none of your keywords")
        val p = deal.percent
        if (p == null) {
            if (!s.includeNoDiscount) return no("no discount stated")
        } else {
            if (deal.d.upTo && !s.includeUpTo) return no("only an “up to” claim")
            if (p < s.minDiscount) return no("$p% is under your ${s.minDiscount}%")
        }
        val quiet = quietNow(s.quiet, localHour)
        return Match(!quiet, true, Tier.NORMAL, if (quiet) "quiet hours" else "matches")
    }

    private fun money(v: Double) = if (v == Math.floor(v)) v.toLong().toString() else v.toString()

    fun notification(catalog: Catalog, deal: Deal, tier: Tier): Pair<String, String> {
        val pct = deal.percent?.let { "${if (deal.d.upTo) "Up to " else ""}$it% off" } ?: ""
        val head = if (tier == Tier.EXTRAORDINARY) (if (deal.d.priceError) "🚨 Price error" else "🚨 $pct") else pct.ifEmpty { "New offer" }
        val store = if (deal.platform == "other") deal.sourceName else catalog.platform(deal.platform).name
        val price = deal.d.price?.let { p -> " · ₹${money(p)}" + (deal.d.mrp?.let { " (MRP ₹${money(it)})" } ?: "") } ?: ""
        return "$head · $store" to "${deal.title}$price"
    }
}
