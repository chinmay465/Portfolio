package com.chinmay.bachat.core

import java.net.URI
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

// Ports of shared/platforms.ts, shared/parse/*.ts and the deal helpers in shared/deal.ts.

object Platforms {
    fun onDomain(url: String, domain: String): Boolean {
        val (host, path) = try {
            val u = URI(url.trim())
            (u.host ?: return false).lowercase() to (u.rawPath ?: "").lowercase()
        } catch (e: Exception) {
            return false
        }
        val slash = domain.indexOf('/')
        val dHost = if (slash < 0) domain else domain.substring(0, slash)
        val dPath = if (slash < 0) "" else domain.substring(slash)
        val hostOk = host == dHost || host.endsWith(".$dHost")
        return hostOk && (dPath.isEmpty() || path.startsWith(dPath))
    }

    fun detect(catalog: Catalog, text: String, links: List<String> = emptyList()): String {
        for (link in links) {
            var best: Pair<String, Int>? = null
            for (p in catalog.platforms) for (d in p.domains) {
                if (onDomain(link, d) && (best == null || d.length > best.second)) best = p.id to d.length
            }
            if (best != null) return best.first
        }
        data class Found(val id: String, val at: Int, val beats: List<String>)
        val found = ArrayList<Found>()
        for (p in catalog.platforms) {
            var at = Int.MAX_VALUE
            for (n in p.names) {
                val re = Regex("(?:^|[^a-z0-9])" + Regex.escape(n) + "(?![a-z0-9])", RegexOption.IGNORE_CASE)
                re.find(text)?.let { at = minOf(at, it.range.first) }
            }
            if (at != Int.MAX_VALUE) found.add(Found(p.id, at, p.beats))
        }
        if (found.isEmpty()) return "other"
        val beaten = found.flatMap { it.beats }.toSet()
        return found.filter { it.id !in beaten }.minBy { it.at }.id
    }
}

object Html {
    private val NAMED = mapOf(
        "amp" to "&", "lt" to "<", "gt" to ">", "quot" to "\"", "apos" to "'", "nbsp" to " ", "rsquo" to "’", "lsquo" to "‘",
        "rdquo" to "”", "ldquo" to "“", "hellip" to "…", "ndash" to "–", "mdash" to "—", "rarr" to "→", "inr" to "₹",
        "rupee" to "₹", "middot" to "·", "bull" to "•", "times" to "×",
    )
    private val ENTITY = Regex("&(#x[0-9a-fA-F]+|#\\d+|[a-zA-Z]+);")

    fun decode(s: String): String = ENTITY.replace(s) { m ->
        val code = m.groupValues[1]
        if (code.startsWith("#")) {
            val n = if (code.length > 1 && (code[1] == 'x' || code[1] == 'X')) code.substring(2).toIntOrNull(16) else code.substring(1).toIntOrNull()
            if (n != null && n in 1 until 0x110000) String(Character.toChars(n)) else m.value
        } else NAMED[code.lowercase()] ?: m.value
    }

    fun toText(html: String): Pair<String, List<String>> {
        val links = Regex("<a\\b[^>]*\\bhref=\"([^\"]+)\"", RegexOption.IGNORE_CASE).findAll(html).map { decode(it.groupValues[1]) }.toList()
        var t = html
            .replace(Regex("<br\\s*/?>", RegexOption.IGNORE_CASE), "\n")
            .replace(Regex("</(?:p|div|li|h\\d|blockquote)>", RegexOption.IGNORE_CASE), "\n")
            .replace(Regex("<(s|del|strike)\\b[^>]*>([\\s\\S]*?)</\\1>", RegexOption.IGNORE_CASE), "~~$2~~")
            .replace(Regex("<img\\b[^>]*\\balt=\"([^\"]*)\"[^>]*>", RegexOption.IGNORE_CASE), "$1")
            .replace(Regex("<[^>]+>"), "")
        t = decode(t)
            .replace(' ', ' ')
            .replace(Regex("[ \\t]+"), " ")
            .replace(Regex(" *\\n *"), "\n")
            .replace(Regex("\\n{3,}"), "\n\n")
            .trim()
        return t to links
    }
}

object Telegram {
    fun url(channel: String, before: String? = null) =
        "https://t.me/s/$channel" + (before?.let { "?before=$it" } ?: "")

    private val START = Regex("<div class=\"tgme_widget_message [^\"]*\"[^>]*\\bdata-post=\"([^\"]+)\"")
    private val TEXT = Regex("<div class=\"tgme_widget_message_text js-message_text[^\"]*\"[^>]*>")
    private val TIME = Regex("<time[^>]*\\bdatetime=\"([^\"]+)\"")
    private val PHOTO = Regex("tgme_widget_message_photo_wrap[^>]*background-image:url\\('([^']+)'\\)")

    fun parse(html: String, channel: String, now: Long = System.currentTimeMillis()): List<RawPost> {
        val starts = START.findAll(html).toList()
        val posts = ArrayList<RawPost>()
        for ((i, m) in starts.withIndex()) {
            val chunk = html.substring(m.range.first, if (i + 1 < starts.size) starts[i + 1].range.first else html.length)
            val dataPost = Html.decode(m.groupValues[1])
            val num = dataPost.substringAfterLast('/')
            if (!num.all { it.isDigit() } || num.isEmpty()) continue
            if (!dataPost.substringBefore('/').equals(channel, ignoreCase = true)) continue
            val tm = TEXT.find(chunk) ?: continue
            val open = tm.range.last + 1
            val (text, links) = Html.toText(chunk.substring(open, closingDiv(chunk, open)))
            if (text.isEmpty()) continue
            val time = TIME.find(chunk)?.groupValues?.get(1)?.let { parseTime(it) } ?: now
            posts.add(
                RawPost(
                    id = num,
                    text = text,
                    links = links.filter { it.startsWith("http://", true) || it.startsWith("https://", true) },
                    postUrl = "https://t.me/$channel/$num",
                    postedAt = time,
                    image = PHOTO.find(chunk)?.groupValues?.get(1)?.let { Html.decode(it) },
                ),
            )
        }
        return posts
    }

    private fun closingDiv(s: String, from: Int): Int {
        var depth = 1
        for (m in Regex("<div\\b|</div>").findAll(s, from)) {
            depth += if (m.value == "</div>") -1 else 1
            if (depth == 0) return m.range.first
        }
        return s.length
    }
}

fun parseTime(s: String): Long? {
    val t = s.trim()
    return runCatching { OffsetDateTime.parse(t).toInstant().toEpochMilli() }.getOrNull()
        ?: runCatching { Instant.parse(t).toEpochMilli() }.getOrNull()
        ?: runCatching { ZonedDateTime.parse(t, DateTimeFormatter.RFC_1123_DATE_TIME).toInstant().toEpochMilli() }.getOrNull()
}

object Feed {
    private fun tag(xml: String, name: String): String =
        Regex("<$name\\b[^>]*>([\\s\\S]*?)</$name>", RegexOption.IGNORE_CASE).find(xml)?.groupValues?.get(1) ?: ""
    private fun unCdata(s: String) = Regex("^\\s*<!\\[CDATA\\[([\\s\\S]*?)]]>\\s*$").find(s)?.groupValues?.get(1) ?: s

    fun parse(xml: String, now: Long = System.currentTimeMillis()): List<RawPost> {
        val out = ArrayList<RawPost>()
        for (bm in Regex("<(item|entry)\\b[^>]*>([\\s\\S]*?)</\\1>", RegexOption.IGNORE_CASE).findAll(xml)) {
            val b = bm.groupValues[2]
            val title = Html.decode(unCdata(tag(b, "title"))).trim()
            val atomLink = Regex("<link\\b[^>]*\\bhref=\"([^\"]+)\"", RegexOption.IGNORE_CASE).find(b)
            val postUrl = Html.decode(atomLink?.groupValues?.get(1) ?: unCdata(tag(b, "link")).trim())
            val id = Html.decode(unCdata(tag(b, "guid").ifEmpty { tag(b, "id") }).trim()).ifEmpty { postUrl }
            val whenText = unCdata(tag(b, "pubDate").ifEmpty { tag(b, "published") }.ifEmpty { tag(b, "updated") }).trim()
            val body = Html.decode(unCdata(tag(b, "content").ifEmpty { tag(b, "description") }.ifEmpty { tag(b, "summary") }))
            val (bodyText, links) = Html.toText(body)
            val thumb = Regex("<media:thumbnail\\b[^>]*\\burl=\"([^\"]+)\"", RegexOption.IGNORE_CASE).find(b)
            val clean = bodyText
                .replace(Regex("submitted by\\s*/u/\\S+", RegexOption.IGNORE_CASE), "")
                .replace(Regex("\\[link]|\\[comments]", RegexOption.IGNORE_CASE), "")
                .trim()
            if (title.isEmpty() || postUrl.isEmpty()) continue
            val text = listOf(title, clean).filter { it.isNotEmpty() }.joinToString("\n").trim()
            out.add(
                RawPost(
                    id = id.substringAfterLast('/').ifEmpty { id },
                    text = text,
                    links = links.filter { (it.startsWith("http://", true) || it.startsWith("https://", true)) && !Regex("reddit\\.com/(?:user|u)/", RegexOption.IGNORE_CASE).containsMatchIn(it) } + postUrl,
                    postUrl = postUrl,
                    postedAt = if (whenText.isEmpty()) now else parseTime(whenText) ?: now,
                    image = thumb?.groupValues?.get(1)?.let { Html.decode(it) },
                ),
            )
        }
        return out
    }
}
