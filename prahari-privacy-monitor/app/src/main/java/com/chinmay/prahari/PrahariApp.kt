package com.chinmay.prahari

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager

class PrahariApp : Application() {
    override fun onCreate() {
        super.onCreate()
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannels(
            listOf(
                NotificationChannel(CH_WATCH, "Watching", NotificationManager.IMPORTANCE_MIN).apply {
                    description = "The always-on watcher. Silent, and hidden from the status bar."
                    setShowBadge(false)
                },
                NotificationChannel(CH_ALERTS, "Alerts", NotificationManager.IMPORTANCE_HIGH).apply {
                    description = "An app used the camera, microphone or clipboard while you weren't using it."
                },
                NotificationChannel(CH_DNS, "DNS watch", NotificationManager.IMPORTANCE_MIN).apply {
                    description = "Shown while DNS watch records which apps contact which servers."
                    setShowBadge(false)
                },
            ),
        )
    }

    companion object {
        const val CH_WATCH = "watch"
        const val CH_ALERTS = "alerts"
        const val CH_DNS = "dns"
    }
}
