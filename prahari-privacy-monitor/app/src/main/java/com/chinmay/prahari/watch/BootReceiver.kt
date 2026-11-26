package com.chinmay.prahari.watch

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.chinmay.prahari.apps.ScanJob

/** Starts watching again after a reboot or an update of Prahari itself. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> {
                try {
                    WatchService.start(context, fromUi = false)
                } catch (_: Exception) {
                    // Some OEM builds refuse background starts; the app restarts it when opened.
                }
                ScanJob.schedulePeriodic(context)
            }
        }
    }
}
