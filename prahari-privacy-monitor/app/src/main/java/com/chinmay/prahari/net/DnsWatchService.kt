package com.chinmay.prahari.net

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.chinmay.prahari.MainActivity
import com.chinmay.prahari.PrahariApp
import com.chinmay.prahari.R
import com.chinmay.prahari.core.LiveState
import com.chinmay.prahari.data.Prefs

/**
 * DNS watch: a local VPN that routes nothing but its own virtual DNS server,
 * so every app's lookups pass through Prahari and all other traffic goes
 * straight to the network. Lookups are answered over DNS-over-HTTPS.
 */
class DnsWatchService : VpnService() {
    private var tun: ParcelFileDescriptor? = null
    private var tunnel: DnsTunnel? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            shutdown()
            stopSelf()
            return START_NOT_STICKY
        }
        goForeground()
        if (tun == null) establish()
        return START_STICKY
    }

    override fun onRevoke() {
        // Another VPN (Kavach, a work VPN…) took over.
        Prefs(this).dnsWatch = false
        LiveState.dnsError.value = "Another VPN took over, so DNS watch stopped."
        shutdown()
        stopSelf()
    }

    override fun onDestroy() {
        shutdown()
        super.onDestroy()
    }

    private fun establish() {
        val builder = Builder()
            .setSession("Prahari DNS watch")
            .addAddress(VPN_ADDRESS, 32)
            .addDnsServer(VPN_DNS)
            .addRoute(VPN_DNS, 32)
            .setBlocking(true)
            .setMetered(false)
        try {
            builder.addDisallowedApplication(packageName)
        } catch (_: Exception) {
        }
        val fd = try {
            builder.establish()
        } catch (e: Exception) {
            null
        }
        if (fd == null) {
            LiveState.dnsError.value = "Android didn't allow the VPN. Open Prahari and turn DNS watch on again."
            Prefs(this).dnsWatch = false
            stopSelf()
            return
        }
        tun = fd
        tunnel = DnsTunnel(this, fd) {
            // The tunnel stopped unexpectedly: take the VPN down so apps go back to normal DNS.
            LiveState.dnsError.value = "DNS watch stopped unexpectedly and was turned off. Turn it on again in Setup."
            Prefs(this).dnsWatch = false
            android.os.Handler(mainLooper).post {
                shutdown()
                stopSelf()
            }
        }.also { it.start() }
        LiveState.dnsOn.value = true
        LiveState.dnsError.value = null
    }

    private fun shutdown() {
        tunnel?.stop()
        tunnel = null
        try {
            tun?.close()
        } catch (_: Exception) {
        }
        tun = null
        LiveState.dnsOn.value = false
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    }

    private fun goForeground() {
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val stop = PendingIntent.getService(
            this, 1, Intent(this, DnsWatchService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val n = NotificationCompat.Builder(this, PrahariApp.CH_DNS)
            .setSmallIcon(R.drawable.ic_stat_watch)
            .setContentTitle("DNS watch is on")
            .setContentText("Recording which apps contact which servers, on this phone only")
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setContentIntent(open)
            .addAction(0, "Stop", stop)
            .build()
        val type = if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0
        ServiceCompat.startForeground(this, NOTIFICATION_ID, n, type)
    }

    companion object {
        private const val ACTION_STOP = "com.chinmay.prahari.DNS_STOP"
        private const val NOTIFICATION_ID = 8
        private const val VPN_ADDRESS = "10.111.233.1"
        private const val VPN_DNS = "10.111.233.53"

        fun start(ctx: Context) {
            ContextCompat.startForegroundService(ctx, Intent(ctx, DnsWatchService::class.java))
        }

        fun stop(ctx: Context) {
            ctx.startService(Intent(ctx, DnsWatchService::class.java).setAction(ACTION_STOP))
        }
    }
}
