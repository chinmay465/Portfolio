package com.chinmay.prahari.watch

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Process

/**
 * Knows which app is on screen and which apps are running foreground services
 * (the only way an app can keep using the camera or mic in the background on
 * Android 11+). Reads Android's usage events incrementally, so each call only
 * looks at what happened since the previous one: no polling, no wakeups.
 */
class UsageTracker(context: Context) {
    private val ctx = context.applicationContext
    private val usm = ctx.getSystemService(UsageStatsManager::class.java)
    private var cursor = 0L
    private var foreground: String? = null
    private val services = HashMap<String, MutableSet<String>>()
    private var cachedAt = 0L

    /** Counts for diagnostics (no package names). */
    @Volatile var resumedSeen = 0
        private set
    @Volatile var eventsSeen = 0
        private set
    private var cached = Now(null, emptySet())

    /** Launchers and the system UI are "nobody" for attribution purposes. */
    val shells: Set<String> by lazy {
        val home = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
        val launchers = ctx.packageManager.queryIntentActivities(home, 0).map { it.activityInfo.packageName }
        (launchers + listOf("com.android.systemui", ctx.packageName)).toSet()
    }

    data class Now(val foreground: String?, val services: Set<String>)

    fun hasAccess(): Boolean = hasUsageAccess(ctx)

    /** The current state. Cheap: results are reused for [maxAgeMs]. */
    @Synchronized
    fun now(maxAgeMs: Long = 0): Now {
        val t = System.currentTimeMillis()
        if (maxAgeMs > 0 && t - cachedAt < maxAgeMs) return cached
        if (!hasAccess()) return Now(null, emptySet())
        // Android makes usage events visible a few seconds after they happen, so each
        // read overlaps the previous one: events that showed up late are still applied.
        val from = if (cursor == 0L) t - DAY else cursor - OVERLAP
        var lastResumed: String? = null
        try {
            val events = usm.queryEvents(from, t)
            val e = UsageEvents.Event()
            while (events.hasNextEvent()) {
                events.getNextEvent(e)
                eventsSeen++
                when (e.eventType) {
                    UsageEvents.Event.ACTIVITY_RESUMED -> {
                        lastResumed = e.packageName
                        resumedSeen++
                    }
                    UsageEvents.Event.FOREGROUND_SERVICE_START ->
                        services.getOrPut(e.packageName) { HashSet() }.add(e.className ?: "")
                    UsageEvents.Event.FOREGROUND_SERVICE_STOP -> {
                        val set = services[e.packageName]
                        set?.remove(e.className ?: "")
                        if (set.isNullOrEmpty()) services.remove(e.packageName)
                    }
                }
            }
        } catch (_: SecurityException) {
        }
        if (lastResumed != null) foreground = lastResumed
        cursor = t
        val fg = foreground?.takeIf { it !in shells }
        cached = Now(fg, services.keys.toSet())
        cachedAt = t
        return cached
    }

    data class Span(val pkg: String, val from: Long, val to: Long)

    /** What was on screen between [from] and [to], and when the screen was off. */
    class History(val onScreen: List<Span>, val screenOff: List<Pair<Long, Long>>) {
        fun foregroundAt(t: Long): String? = onScreen.lastOrNull { t >= it.from && t <= it.to }?.pkg
        fun screenOffAt(t: Long): Boolean = screenOff.any { t >= it.first && t <= it.second }
    }

    fun history(from: Long, to: Long): History {
        if (!hasAccess()) return History(emptyList(), emptyList())
        val spans = ArrayList<Span>()
        val off = ArrayList<Pair<Long, Long>>()
        var cur: String? = null
        var curFrom = from
        var offFrom = -1L
        try {
            val events = usm.queryEvents(from, to)
            val e = UsageEvents.Event()
            while (events.hasNextEvent()) {
                events.getNextEvent(e)
                when (e.eventType) {
                    UsageEvents.Event.ACTIVITY_RESUMED -> {
                        cur?.let { spans += Span(it, curFrom, e.timeStamp) }
                        cur = e.packageName
                        curFrom = e.timeStamp
                    }
                    UsageEvents.Event.ACTIVITY_PAUSED -> if (cur == e.packageName) {
                        spans += Span(e.packageName, curFrom, e.timeStamp)
                        cur = null
                    }
                    UsageEvents.Event.SCREEN_NON_INTERACTIVE -> offFrom = e.timeStamp
                    UsageEvents.Event.SCREEN_INTERACTIVE -> if (offFrom >= 0) {
                        off += offFrom to e.timeStamp
                        offFrom = -1
                    }
                }
            }
        } catch (_: SecurityException) {
        }
        cur?.let { spans += Span(it, curFrom, to) }
        if (offFrom >= 0) off += offFrom to to
        return History(spans.filter { it.pkg !in shells }, off)
    }

    companion object {
        private const val DAY = 24 * 60 * 60 * 1000L
        private const val OVERLAP = 5 * 60 * 1000L

        fun hasUsageAccess(ctx: Context): Boolean {
            val aom = ctx.getSystemService(AppOpsManager::class.java)
            val mode = aom.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.packageName)
            return if (mode == AppOpsManager.MODE_DEFAULT) {
                ctx.checkSelfPermission(android.Manifest.permission.PACKAGE_USAGE_STATS) == android.content.pm.PackageManager.PERMISSION_GRANTED
            } else {
                mode == AppOpsManager.MODE_ALLOWED
            }
        }
    }
}
