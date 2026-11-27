package com.chinmay.bachat.data

import android.content.Context
import com.chinmay.bachat.core.Deal
import com.chinmay.bachat.core.Deals
import com.chinmay.bachat.core.Feed
import com.chinmay.bachat.core.Match
import com.chinmay.bachat.core.RawPost
import com.chinmay.bachat.core.SourceDef
import com.chinmay.bachat.core.Telegram
import com.chinmay.bachat.core.Tier
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import java.util.Calendar

data class ScanResult(val newDeals: Int, val alerts: Int, val failed: List<String>)

/** One check, the same steps as scanner/scan.ts on the server, run on the phone. */
object Scanner {
    private const val MAX_ALERTS = 5
    private const val MAX_EXTRA_PAGES = 2
    private const val UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36"
    private val lock = Mutex()

    fun sources(): List<SourceDef> {
        val list = Repo.catalog.sources.filter { it.enabled }.toMutableList()
        val seen = list.mapNotNull { it.channel?.lowercase() }.toMutableSet()
        for (ch in Repo.settings.value.channels) {
            if (seen.add(ch.lowercase())) list.add(SourceDef("tg:${ch.lowercase()}", "telegram", "@$ch", true, channel = ch))
        }
        return list
    }

    fun fetch(url: String): String {
        val c = URL(url).openConnection() as HttpURLConnection
        try {
            c.connectTimeout = 15_000
            c.readTimeout = 15_000
            c.instanceFollowRedirects = true
            c.setRequestProperty("User-Agent", UA)
            c.setRequestProperty("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
            c.setRequestProperty("Accept-Language", "en-IN,en;q=0.9")
            if (c.responseCode !in 200..299) throw IllegalStateException("HTTP ${c.responseCode}")
            // readNBytes needs API 33; read by hand with a 3 MB cap.
            val out = java.io.ByteArrayOutputStream()
            c.inputStream.use { input ->
                val buf = ByteArray(16_384)
                while (out.size() < 3_000_000) {
                    val n = input.read(buf)
                    if (n < 0) break
                    out.write(buf, 0, n)
                }
            }
            return out.toString("UTF-8")
        } finally {
            c.disconnect()
        }
    }

    private fun read(src: SourceDef): List<RawPost> {
        if (src.kind == "rss") {
            val items = Feed.parse(fetch(src.url!!))
            if (items.isEmpty()) throw IllegalStateException("not a feed, or no items")
            return items
        }
        val ch = src.channel!!
        var posts = Telegram.parse(fetch(Telegram.url(ch)), ch)
        if (posts.isEmpty()) throw IllegalStateException("not a public channel, or no posts")
        val last = Repo.lastPostId(src.id)?.toLongOrNull()
        var page = 0
        while (last != null && page++ < MAX_EXTRA_PAGES) {
            val oldest = posts.minOf { it.id.toLong() }
            if (oldest <= last + 1) break
            val older = Telegram.parse(fetch(Telegram.url(ch, oldest.toString())), ch).filter { it.id.toLong() < oldest }
            if (older.isEmpty()) break
            posts = older + posts
        }
        return posts
    }

    suspend fun run(ctx: Context): ScanResult = lock.withLock {
        withContext(Dispatchers.IO) {
            Repo.init(ctx)
            Repo.scanning.value = true
            try {
                scan(ctx)
            } finally {
                Repo.scanning.value = false
            }
        }
    }

    private suspend fun scan(ctx: Context): ScanResult = coroutineScope {
        val now = System.currentTimeMillis()
        val gate = Semaphore(4)
        val list = sources()
        val results = list.map { src ->
            async {
                gate.withPermit {
                    try {
                        val posts = read(src)
                        val deals = posts.map { Deals.toDeal(Repo.catalog, it, src.id, src.name, now) }
                        val newest = if (src.kind == "telegram") posts.maxOf { it.id.toLong() }.toString() else null
                        Repo.recordSource(SourceState(src.id, src.name, true, posts.size, null, now, newest))
                        deals
                    } catch (e: Exception) {
                        Repo.recordSource(SourceState(src.id, src.name, false, 0, e.message ?: e.javaClass.simpleName, now, null))
                        null
                    }
                }
            }
        }.awaitAll()
        val fresh = Repo.mergeDeals(results.filterNotNull().flatten(), now)
        val failed = list.map { it.name }.zip(results).filter { it.second == null }.map { it.first }

        // Alerts: everything first seen in the last two days that hasn't alerted yet.
        val settings = Repo.settings.value
        val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
        val due = Repo.deals.value
            .filter { now - it.firstSeen < 48 * 3_600_000L && !Repo.wasNotified(it.id) }
            .map { it to Deals.match(it, settings, now, hour) }
            .filter { it.second.notify }
            .sortedWith(
                compareBy<Pair<Deal, Match>> { if (it.second.tier == Tier.EXTRAORDINARY) 0 else 1 }
                    .thenByDescending { it.first.percent ?: 0 }
                    .thenByDescending { it.first.postedAt },
            )
        var sent = 0
        val extra = ArrayList<Deal>()
        if (Alerts.allowed(ctx)) {
            for ((deal, m) in due) {
                if (!Repo.claim(deal.id, now)) continue
                if (sent >= MAX_ALERTS) extra.add(deal) else {
                    Alerts.deal(ctx, deal, m.tier!!)
                    sent++
                }
            }
            if (extra.isNotEmpty()) Alerts.summary(ctx, extra)
        }
        Repo.finishScan(now)
        ScanResult(fresh.size, sent, failed)
    }
}
