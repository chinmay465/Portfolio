package com.chinmay.kavach.vpn

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.chinmay.kavach.MainActivity
import com.chinmay.kavach.R

/**
 * A local VPN that captures only DNS. The tunnel's DNS server is a virtual
 * address that exists only inside the tunnel, so every app's lookups arrive
 * here, while all other traffic keeps using the normal network at full speed.
 */
class AdBlockVpnService : VpnService() {

    private var tun: ParcelFileDescriptor? = null
    private var tunnel: DnsTunnel? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopVpn()
            return START_NOT_STICKY
        }
        // ACTION_START from the app, or a start by the system (Always-on VPN / restart).
        startVpn()
        // Not sticky: persistence across reboots/kills comes from Android's
        // "Always-on VPN" setting, which restarts us properly.
        return START_NOT_STICKY
    }

    private fun startVpn() {
        if (tunnel != null) return
        try {
            goForeground()
        } catch (e: Exception) {
            // e.g. ForegroundServiceStartNotAllowedException on a background restart.
            Log.w(TAG, "Could not enter foreground", e)
        }

        val builder = Builder()
            .setSession(getString(R.string.app_name))
            .addAddress(VPN_ADDRESS, 32)
            .addDnsServer(VPN_DNS)
            .addRoute(VPN_DNS, 32) // only the virtual DNS server is routed into the tunnel
            .setBlocking(true)
            .setConfigureIntent(openAppIntent())
        try {
            // Our own traffic (blocklist downloads, DoH upstream) must skip the VPN,
            // otherwise lookups would loop back into the tunnel.
            builder.addDisallowedApplication(packageName)
        } catch (e: PackageManager.NameNotFoundException) {
            Log.e(TAG, "Could not exclude own package", e)
            stopVpn()
            return
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            builder.setMetered(false) // don't make Wi-Fi look metered to other apps
        }

        val fd = try {
            builder.establish()
        } catch (e: Exception) {
            Log.e(TAG, "establish() failed", e)
            null
        }
        if (fd == null) {
            // VPN permission was revoked or never granted.
            stopVpn()
            return
        }

        tun = fd
        tunnel = DnsTunnel(this, fd).also { it.start() }
        AdBlockState.resetSession()
        AdBlockState.running.value = true
    }

    private fun stopVpn() {
        tunnel?.stop()
        tunnel = null
        try {
            tun?.close()
        } catch (_: Exception) {
        }
        tun = null
        AdBlockState.running.value = false
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onRevoke() {
        // Another VPN took over, or the user disconnected from system settings.
        stopVpn()
        super.onRevoke()
    }

    override fun onDestroy() {
        if (tunnel != null) stopVpn()
        super.onDestroy()
    }

    private fun goForeground() {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                getString(R.string.notification_channel),
                NotificationManager.IMPORTANCE_LOW,
            ),
        )
        val stop = PendingIntent.getService(
            this,
            1,
            Intent(this, AdBlockVpnService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_shield)
            .setContentTitle(getString(R.string.notification_title))
            .setContentText(getString(R.string.notification_text))
            .setContentIntent(openAppIntent())
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .addAction(0, getString(R.string.stop), stop)
            .build()

        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
        } else {
            0
        }
        ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, type)
    }

    private fun openAppIntent(): PendingIntent = PendingIntent.getActivity(
        this,
        0,
        Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    companion object {
        private const val TAG = "KavachVpn"
        private const val ACTION_START = "com.chinmay.kavach.START"
        private const val ACTION_STOP = "com.chinmay.kavach.STOP"
        private const val CHANNEL_ID = "kavach_vpn"
        private const val NOTIFICATION_ID = 1

        // Private addresses that exist only inside the tunnel.
        private const val VPN_ADDRESS = "10.111.222.1"
        private const val VPN_DNS = "10.111.222.53"

        fun start(ctx: Context) {
            ContextCompat.startForegroundService(
                ctx,
                Intent(ctx, AdBlockVpnService::class.java).setAction(ACTION_START),
            )
        }

        fun stop(ctx: Context) {
            ctx.startService(Intent(ctx, AdBlockVpnService::class.java).setAction(ACTION_STOP))
        }
    }
}
