package com.chinmay.bachat.data

import android.content.Context
import com.chinmay.bachat.core.Catalog
import com.chinmay.bachat.core.Deal
import com.chinmay.bachat.core.Json
import com.chinmay.bachat.core.Settings
import com.chinmay.bachat.core.bool
import com.chinmay.bachat.core.list
import com.chinmay.bachat.core.num
import com.chinmay.bachat.core.obj
import com.chinmay.bachat.core.str
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.io.File

data class SourceState(
    val id: String,
    val name: String,
    val ok: Boolean,
    val posts: Int,
    val error: String?,
    val checkedAt: Long,
    val lastPostId: String?,
) {
    fun toMap() = mapOf("id" to id, "name" to name, "ok" to ok, "posts" to posts, "error" to error, "checkedAt" to checkedAt, "lastPostId" to lastPostId)

    companion object {
        fun from(m: Map<String, Any?>) = SourceState(
            m.str("id") ?: "", m.str("name") ?: "", m.bool("ok") ?: false, m.num("posts")?.toInt() ?: 0,
            m.str("error"), m.num("checkedAt")?.toLong() ?: 0L, m.str("lastPostId"),
        )
    }
}

/**
 * Everything Bachat keeps on the phone: settings, deals seen in the last week, which deals
 * already alerted, and source health. Plain JSON files in the app's private storage.
 */
object Repo {
    lateinit var catalog: Catalog
        private set
    private lateinit var dir: File

    private val _settings = MutableStateFlow(Settings())
    private val _deals = MutableStateFlow<List<Deal>>(emptyList())
    private val _sources = MutableStateFlow<Map<String, SourceState>>(emptyMap())
    private val _lastScan = MutableStateFlow(0L)
    val scanning = MutableStateFlow(false)
    val settings: StateFlow<Settings> = _settings
    val deals: StateFlow<List<Deal>> = _deals
    val sources: StateFlow<Map<String, SourceState>> = _sources
    val lastScan: StateFlow<Long> = _lastScan

    private var notified = LinkedHashMap<String, Long>()
    private var ready = false

    @Synchronized
    fun init(ctx: Context) {
        if (ready) return
        val assets = ctx.applicationContext.assets
        catalog = Catalog(
            assets.open("platforms.json").bufferedReader().use { it.readText() },
            assets.open("sources.json").bufferedReader().use { it.readText() },
        )
        dir = File(ctx.applicationContext.filesDir, "bachat").apply { mkdirs() }
        _settings.value = read("settings.json")?.let { Settings.from(it) } ?: Settings()
        _deals.value = read("deals.json").list().mapNotNull { runCatching { Deal.from(it.obj()) }.getOrNull() }
        _sources.value = read("sources.json").list().map { SourceState.from(it.obj()) }.associateBy { it.id }
        notified = LinkedHashMap(read("notified.json").obj().mapNotNull { (k, v) -> (v as? Double)?.let { k to it.toLong() } }.toMap())
        _lastScan.value = read("meta.json").obj().num("lastScan")?.toLong() ?: 0L
        ready = true
    }

    private fun read(name: String): Any? = runCatching { File(dir, name).takeIf { it.exists() }?.readText()?.let { Json.parse(it) } }.getOrNull()

    private fun write(name: String, value: Any?) {
        val tmp = File(dir, "$name.tmp")
        tmp.writeText(Json.write(value))
        tmp.renameTo(File(dir, name))
    }

    @Synchronized
    fun saveSettings(s: Settings) {
        val clean = Settings.from(Json.parse(Json.write(s.toMap())))
        _settings.value = clean
        write("settings.json", clean.toMap())
    }

    /** Adds deals not seen before (returns those), keeping a week of history and at most 500. */
    @Synchronized
    fun mergeDeals(incoming: List<Deal>, now: Long): List<Deal> {
        val byId = LinkedHashMap<String, Deal>()
        for (d in _deals.value) byId[d.id] = d
        val fresh = incoming.filter { it.id !in byId }
        for (d in fresh) byId[d.id] = d
        val week = 7 * 24 * 3_600_000L
        val kept = byId.values
            .filter { now - it.postedAt < week || now - it.firstSeen < week }
            .sortedByDescending { it.postedAt }
            .take(500)
        _deals.value = kept
        write("deals.json", kept.map { it.toMap() })
        return fresh
    }

    @Synchronized
    fun recordSource(s: SourceState) {
        val prev = _sources.value[s.id]
        val next = if (s.lastPostId == null && prev != null) s.copy(lastPostId = prev.lastPostId) else s
        _sources.value = _sources.value + (s.id to next)
        write("sources.json", _sources.value.values.map { it.toMap() })
    }

    fun lastPostId(id: String): String? = _sources.value[id]?.lastPostId

    fun wasNotified(id: String) = id in notified

    /** Marks a deal as alerted; false if it already was. */
    @Synchronized
    fun claim(id: String, now: Long): Boolean {
        if (id in notified) return false
        notified[id] = now
        return true
    }

    @Synchronized
    fun finishScan(now: Long) {
        val cutoff = now - 8 * 24 * 3_600_000L
        notified.entries.removeAll { it.value < cutoff }
        write("notified.json", notified)
        _lastScan.value = now
        write("meta.json", mapOf("lastScan" to now))
    }
}
