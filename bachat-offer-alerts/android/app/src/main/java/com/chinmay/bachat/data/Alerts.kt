package com.chinmay.bachat.data

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.chinmay.bachat.MainActivity
import com.chinmay.bachat.R
import com.chinmay.bachat.core.Deal
import com.chinmay.bachat.core.Deals
import com.chinmay.bachat.core.Tier

/** Notification channels and the alerts themselves. */
object Alerts {
    const val OFFERS = "offers"
    const val EXTRAORDINARY = "extraordinary"
    private const val SUMMARY_ID = 7_000_001
    private val WOW_VIBRATION = longArrayOf(0, 120, 60, 120, 60, 260)

    fun createChannels(ctx: Context) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(OFFERS, "Offers", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "Offers that match your discount and store rules"
            },
        )
        nm.createNotificationChannel(
            NotificationChannel(EXTRAORDINARY, "Extraordinary deals", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "90%+ off and price errors. These usually last minutes."
                enableVibration(true)
                vibrationPattern = WOW_VIBRATION
            },
        )
    }

    fun allowed(ctx: Context): Boolean {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return false
        return NotificationManagerCompat.from(ctx).areNotificationsEnabled()
    }

    private fun openApp(ctx: Context, code: Int) = PendingIntent.getActivity(
        ctx, code, Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    private fun openUrl(ctx: Context, url: String, code: Int) = PendingIntent.getActivity(
        ctx, code, Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    @Suppress("MissingPermission") // allowed() is checked by every caller
    fun deal(ctx: Context, deal: Deal, tier: Tier) {
        val (title, body) = Deals.notification(Repo.catalog, deal, tier)
        val id = deal.id.hashCode()
        val wow = tier == Tier.EXTRAORDINARY
        val n = NotificationCompat.Builder(ctx, if (wow) EXTRAORDINARY else OFFERS)
            .setSmallIcon(R.drawable.ic_stat_bachat)
            .setColor(if (wow) 0xFFFF3D7F.toInt() else 0xFFD4FF3A.toInt())
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setWhen(deal.postedAt)
            .setShowWhen(true)
            .setAutoCancel(true)
            .setPriority(if (wow) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(if (wow) NotificationCompat.CATEGORY_ALARM else NotificationCompat.CATEGORY_RECOMMENDATION)
            .setContentIntent(openUrl(ctx, deal.url, id))
            .addAction(0, "Open deal", openUrl(ctx, deal.url, id + 1))
            .addAction(0, "All offers", openApp(ctx, 1))
            .apply { if (wow) setVibrate(WOW_VIBRATION) }
            .setGroup(if (wow) EXTRAORDINARY else OFFERS)
            .build()
        NotificationManagerCompat.from(ctx).notify(id, n)
    }

    @Suppress("MissingPermission")
    fun summary(ctx: Context, extra: List<Deal>) {
        val best = extra.maxBy { it.percent ?: 0 }
        val n = NotificationCompat.Builder(ctx, OFFERS)
            .setSmallIcon(R.drawable.ic_stat_bachat)
            .setColor(0xFFD4FF3A.toInt())
            .setContentTitle("${extra.size} more offers match your alerts")
            .setContentText("Best: ${Deals.notification(Repo.catalog, best, Tier.NORMAL).first}. Open Bachat to see them all.")
            .setAutoCancel(true)
            .setContentIntent(openApp(ctx, 2))
            .build()
        NotificationManagerCompat.from(ctx).notify(SUMMARY_ID, n)
    }

    @Suppress("MissingPermission")
    fun test(ctx: Context) {
        if (!allowed(ctx)) return
        val n = NotificationCompat.Builder(ctx, EXTRAORDINARY)
            .setSmallIcon(R.drawable.ic_stat_bachat)
            .setColor(0xFFFF3D7F.toInt())
            .setContentTitle("🚨 96% off · Test alert")
            .setContentText("This is how extraordinary deals look: loud, and they skip quiet hours.")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(openApp(ctx, 3))
            .build()
        NotificationManagerCompat.from(ctx).notify(SUMMARY_ID + 1, n)
    }
}
