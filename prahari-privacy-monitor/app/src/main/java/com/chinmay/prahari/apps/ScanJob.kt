package com.chinmay.prahari.apps

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import android.os.PersistableBundle
import com.chinmay.prahari.core.LiveState
import com.chinmay.prahari.data.Db
import com.chinmay.prahari.data.Prefs
import java.util.concurrent.atomic.AtomicBoolean

/** Tracker-SDK scanning: each APK is read once per version, never while it would cost you battery. */
object Scanner {
    private const val TRYING = "#trying"
    private val busy = AtomicBoolean(false)

    /** Scans apps whose version changed since their last scan. Returns how many were scanned. */
    fun scan(ctx: Context, apps: List<AppInfo>, progress: (done: Int, total: Int, label: String) -> Unit = { _, _, _ -> }): Int {
        if (!busy.compareAndSet(false, true)) return 0
        try {
            val db = Db.get(ctx)
            val known = db.scans()
            // An app whose scan was started but never finished (Prahari was killed or ran
            // out of memory on it) is not retried for that version, so one odd APK can't
            // crash Prahari every time Apps opens.
            val todo = apps.filter { known[it.pkg]?.stamp.let { s -> s != it.stamp && s != it.stamp + TRYING } }
            todo.forEachIndexed { i, app ->
                progress(i, todo.size, app.label)
                db.putScan(app.pkg, Db.ScanRow(app.stamp + TRYING, emptyList(), System.currentTimeMillis()))
                val found = DexTypes.trackersInApks(app.apks)
                db.putScan(app.pkg, Db.ScanRow(app.stamp, found.sorted(), System.currentTimeMillis()))
            }
            progress(todo.size, todo.size, "")
            if (todo.isNotEmpty()) LiveState.bump()
            return todo.size
        } finally {
            busy.set(false)
        }
    }
}

class ScanJob : JobService() {
    @Volatile private var worker: Thread? = null

    override fun onStartJob(params: JobParameters): Boolean {
        val only = params.extras.getString(EXTRA_PKG)
        worker = Thread {
            val prefs = Prefs(this)
            val apps = if (only != null) listOfNotNull(Inventory.one(this, only)) else Inventory.load(this, prefs.includeSystem)
            Scanner.scan(this, apps)
            jobFinished(params, false)
        }.apply {
            priority = Thread.MIN_PRIORITY
            start()
        }
        return true
    }

    override fun onStopJob(params: JobParameters): Boolean = true

    companion object {
        private const val EXTRA_PKG = "pkg"
        private const val PERIODIC_ID = 1

        /** Daily catch-up, only while charging. */
        fun schedulePeriodic(ctx: Context) {
            val js = ctx.getSystemService(JobScheduler::class.java)
            if (js.getPendingJob(PERIODIC_ID) != null) return
            js.schedule(
                JobInfo.Builder(PERIODIC_ID, ComponentName(ctx, ScanJob::class.java))
                    .setPeriodic(24 * 60 * 60 * 1000L)
                    .setRequiresCharging(true)
                    .setRequiresBatteryNotLow(true)
                    .setPersisted(false)
                    .build(),
            )
        }

        /** A newly installed or updated app, scanned a minute later when the battery isn't low. */
        fun scheduleOne(ctx: Context, pkg: String) {
            val js = ctx.getSystemService(JobScheduler::class.java)
            js.schedule(
                JobInfo.Builder(1000 + (pkg.hashCode() and 0xFFFF), ComponentName(ctx, ScanJob::class.java))
                    .setMinimumLatency(60_000)
                    .setOverrideDeadline(6 * 60 * 60 * 1000L)
                    .setRequiresBatteryNotLow(true)
                    .setExtras(PersistableBundle().apply { putString(EXTRA_PKG, pkg) })
                    .build(),
            )
        }
    }
}
