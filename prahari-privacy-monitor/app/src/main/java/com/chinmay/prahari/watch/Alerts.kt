package com.chinmay.prahari.watch

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.chinmay.prahari.MainActivity
import com.chinmay.prahari.PrahariApp
import com.chinmay.prahari.R
import com.chinmay.prahari.apps.Labels
import com.chinmay.prahari.core.Access
import com.chinmay.prahari.core.Kind
import com.chinmay.prahari.data.Prefs

/** Heads-up notifications for the uses worth knowing about right away. */
class Alerts(context: Context) {
    private val ctx = context.applicationContext
    private val prefs = Prefs(ctx)

    fun shouldAlert(a: Access): Boolean {
        if (!prefs.alerts) return false
        if (a.kind != Kind.CAMERA && a.kind != Kind.MIC && a.kind != Kind.CLIPBOARD) return false
        return a.background || prefs.alertForeground
    }

    fun post(a: Access) {
        if (ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val who = when {
            a.pkg != null -> Labels.name(ctx, a.pkg)
            a.candidates.isNotEmpty() -> "One of: " + Labels.names(ctx, a.candidates)
            else -> "An unknown app"
        }
        val what = when (a.kind) {
            Kind.CAMERA -> "is using the camera"
            Kind.MIC -> "is using the microphone"
            Kind.CLIPBOARD -> "read your clipboard"
            else -> "used ${a.kind.label.lowercase()}"
        }
        val why = buildList {
            if (a.screenOff) add("screen off") else if (a.background) add("not on screen")
            a.detail?.let { add(it) }
        }.joinToString(" · ")
        val open = PendingIntent.getActivity(
            ctx, 0,
            Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val n = NotificationCompat.Builder(ctx, PrahariApp.CH_ALERTS)
            .setSmallIcon(R.drawable.ic_stat_watch)
            .setContentTitle("$who $what")
            .setContentText(why.ifEmpty { "Tap to see the timeline" })
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(open)
            // On the lock screen, say only that something happened, not which app.
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(
                NotificationCompat.Builder(ctx, PrahariApp.CH_ALERTS)
                    .setSmallIcon(R.drawable.ic_stat_watch)
                    .setContentTitle("Prahari alert")
                    .setContentText("Unlock to see which app")
                    .build(),
            )
            .build()
        try {
            NotificationManagerCompat.from(ctx).notify((a.kind.ordinal shl 20) + ((a.pkg?.hashCode() ?: 0) and 0xFFFFF), n)
        } catch (_: SecurityException) {
        }
    }
}
