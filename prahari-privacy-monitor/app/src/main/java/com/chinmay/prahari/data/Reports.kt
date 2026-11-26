package com.chinmay.prahari.data

import android.content.Context
import com.chinmay.prahari.apps.AppInfo
import com.chinmay.prahari.apps.Inventory
import com.chinmay.prahari.apps.TrackerSdks
import com.chinmay.prahari.core.Access
import com.chinmay.prahari.core.DnsHit
import com.chinmay.prahari.core.Kind
import com.chinmay.prahari.core.Risk
import com.chinmay.prahari.net.NetUsage
import com.chinmay.prahari.net.TrackerDomains

/** Everything Prahari knows about one app, joined up for the screens. */
data class AppReport(
    val app: AppInfo,
    val trackers: List<TrackerSdks.Sdk>,
    val scanned: Boolean,
    val risk: Risk.Result,
    val net: NetUsage.AppNet?,
    val screenMinutes: Long,
    val accesses: List<Access>,
    val dns: List<DnsHit>,
)

object Reports {
    const val WEEK = 7 * 24 * 60 * 60 * 1000L

    fun all(ctx: Context, includeSystem: Boolean, apps: List<AppInfo> = Inventory.load(ctx, includeSystem)): List<AppReport> {
        val now = System.currentTimeMillis()
        val since = now - WEEK
        val db = Db.get(ctx)
        val scans = db.scans()
        val accesses = db.accesses(since, limit = 20_000)
        val byPkg = HashMap<String, MutableList<Access>>()
        for (a in accesses) {
            val owners = if (a.pkg != null) setOf(a.pkg) else a.candidates.toSet()
            owners.forEach { byPkg.getOrPut(it) { ArrayList() } += a }
        }
        val dns = db.dns(since, limit = 50_000) { TrackerDomains.label(it) }.groupBy { it.pkg }
        val net = NetUsage.byUid(ctx, since, now)
        val minutes = NetUsage.screenMinutes(ctx, since, now)
        return apps.map { app ->
            build(app, scans[app.pkg], byPkg[app.pkg].orEmpty(), dns[app.pkg].orEmpty(), net[app.uid], minutes[app.pkg] ?: 0)
        }.sortedWith(compareByDescending<AppReport> { it.risk.score }.thenBy { it.app.label.lowercase() })
    }

    fun one(ctx: Context, pkg: String): AppReport? {
        val app = Inventory.one(ctx, pkg) ?: return null
        val now = System.currentTimeMillis()
        val since = now - WEEK
        val db = Db.get(ctx)
        return build(
            app,
            db.scans()[pkg],
            db.accesses(since, pkg = pkg, limit = 2_000),
            db.dns(since, pkg = pkg) { TrackerDomains.label(it) },
            NetUsage.byUid(ctx, since, now)[app.uid],
            NetUsage.screenMinutes(ctx, since, now)[pkg] ?: 0,
        )
    }

    private fun build(app: AppInfo, scan: Db.ScanRow?, acc: List<Access>, dns: List<DnsHit>, net: NetUsage.AppNet?, minutes: Long): AppReport {
        val trackers = TrackerSdks.resolve(scan?.trackers.orEmpty())
        val mine = acc.filter { it.pkg == app.pkg }
        val input = Risk.Input(
            system = app.system,
            granted = app.granted,
            exposure = app.exposure,
            trackers = trackers,
            bgSensorUses = mine.count { it.background && (it.kind == Kind.CAMERA || it.kind == Kind.MIC) },
            bgClipboard = mine.count { it.background && it.kind == Kind.CLIPBOARD && it.detail?.contains("keyboard") != true },
            bgLocation = mine.count { it.background && it.kind == Kind.LOCATION },
            bgUploadBytes = net?.bgTx ?: 0,
            screenMinutes = minutes,
            trackerDomains = dns.count { it.tracker != null },
        )
        return AppReport(app, trackers, scan != null && scan.stamp == app.stamp, Risk.score(input), net, minutes, acc, dns)
    }
}
