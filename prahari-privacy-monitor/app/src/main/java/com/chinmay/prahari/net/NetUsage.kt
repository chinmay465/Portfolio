package com.chinmay.prahari.net

import android.app.usage.NetworkStats
import android.app.usage.NetworkStatsManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.net.ConnectivityManager

/**
 * Per-app data use from Android's own network accounting, split into what
 * each app sent while you were using it and while it was in the background.
 * Read only when you open the screen: it costs nothing in between.
 */
object NetUsage {

    data class AppNet(
        val uid: Int,
        var fgRx: Long = 0, var fgTx: Long = 0,
        var bgRx: Long = 0, var bgTx: Long = 0,
    ) {
        val total get() = fgRx + fgTx + bgRx + bgTx
        val bg get() = bgRx + bgTx
    }

    @Suppress("DEPRECATION")
    fun byUid(ctx: Context, start: Long, end: Long): Map<Int, AppNet> {
        val nsm = ctx.getSystemService(NetworkStatsManager::class.java)
        val out = HashMap<Int, AppNet>()
        for (type in intArrayOf(ConnectivityManager.TYPE_WIFI, ConnectivityManager.TYPE_MOBILE)) {
            try {
                val stats = nsm.querySummary(type, null, start, end)
                val b = NetworkStats.Bucket()
                while (stats.getNextBucket(b)) {
                    val a = out.getOrPut(b.uid) { AppNet(b.uid) }
                    if (b.state == NetworkStats.Bucket.STATE_FOREGROUND) {
                        a.fgRx += b.rxBytes
                        a.fgTx += b.txBytes
                    } else {
                        a.bgRx += b.rxBytes
                        a.bgTx += b.txBytes
                    }
                }
                stats.close()
            } catch (_: Exception) {
                // No usage access yet, or no mobile network on this device.
            }
        }
        return out
    }

    /** Minutes each app was on screen in the window. */
    fun screenMinutes(ctx: Context, start: Long, end: Long): Map<String, Long> = try {
        ctx.getSystemService(UsageStatsManager::class.java)
            .queryAndAggregateUsageStats(start, end)
            .mapValues { it.value.totalTimeInForeground / 60_000 }
    } catch (_: Exception) {
        emptyMap()
    }

    fun bytes(n: Long): String = when {
        n >= 1L shl 30 -> String.format(java.util.Locale.US, "%.1f GB", n / (1L shl 30).toDouble())
        n >= 1L shl 20 -> String.format(java.util.Locale.US, "%.1f MB", n / (1L shl 20).toDouble())
        n >= 1L shl 10 -> String.format(java.util.Locale.US, "%.0f KB", n / (1L shl 10).toDouble())
        else -> "$n B"
    }
}
