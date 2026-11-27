package com.chinmay.bachat.data

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

/** The background check. WorkManager runs it on a schedule, batched with other apps to save battery. */
class ScanWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result = try {
        Scanner.run(applicationContext)
        Result.success()
    } catch (e: Exception) {
        Result.retry()
    }
}

object Schedule {
    private const val NAME = "bachat-scan"

    /** (Re)schedules the periodic check; Android's minimum interval is 15 minutes. */
    fun apply(ctx: Context, minutes: Int, replace: Boolean = false) {
        val req = PeriodicWorkRequestBuilder<ScanWorker>(minutes.coerceAtLeast(15).toLong(), TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(
            NAME,
            if (replace) ExistingPeriodicWorkPolicy.UPDATE else ExistingPeriodicWorkPolicy.KEEP,
            req,
        )
    }
}
