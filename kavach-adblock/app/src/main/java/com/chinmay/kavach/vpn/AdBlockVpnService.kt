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
import com.chinmay.kavach.proxy.FullTunnel
import com.chinmay.kavach.proxy.ProxyManager
import com.chinmay.kavach.proxy.ProxySettings
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * A local VPN that captures only DNS. The tunnel's DNS server is a virtual
 * address that exists only inside the tunnel, so every app's lookups arrive
 * here, while all other traffic keeps using the normal network at full speed.
 *
 * In proxy mode it captures all traffic instead: the full tunnel hands every
 * TCP connection to Kavach's loopback proxy, which blocks ad hosts and
 * forwards the rest through free proxies from Setu (see [ProxyManager]).
 */
class AdBlockVpnService : VpnService() {

    @Volatile private var running = false
    @Volatile private var tun: ParcelFileDescriptor? = null
    /** DNS-only mode's loop. Null while the full tunnel runs (proxy mode). */
    @Volatile private var tunnel: DnsTunnel? = null
    @Volatile private var fullTunnel = false
    @Volatile private var proxy: ProxyManager? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var statusJob: Job? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopVpn()
                return START_NOT_STICKY
            }
            ACTION_PROXY_RESTART -> if (running) {
                // Setting, Setu URL or token changed: start over with fresh proxies.
                proxy?.stop()
                proxy = null
                establish(proxyPort = null)
                applyProxySetting()
                return START_NOT_STICKY
            }
            ACTION_PROXY_APPS -> if (running) {
                proxy?.currentPort?.let { establish(it) }
                return START_NOT_STICKY
            }
            ACTION_PROXY_NEXT -> if (running) {
                proxy?.next()
                return START_NOT_STICKY
            }
        }
        // ACTION_START from the app, or a start by the system (Always-on VPN / restart).
        startVpn()
        // Not sticky: persistence across reboots/kills comes from Android's
        // "Always-on VPN" setting, which restarts us properly.
        return START_NOT_STICKY
    }

    private fun startVpn() {
        if (running) return
        try {
            goForeground()
        } catch (e: Exception) {
            // e.g. ForegroundServiceStartNotAllowedException on a background restart.
            Log.w(TAG, "Could not enter foreground", e)
        }
        if (!establish(proxyPort = null)) {
            // VPN permission was revoked or never granted.
            stopVpn()
            return
        }
        running = true
        AdBlockState.resetSession()
        AdBlockState.running.value = true
        observeProxyStatus()
        applyProxySetting()
    }

    /**
     * Builds the tun interface and starts what reads it. Without [socksPort]
     * that's DNS-only mode: only the virtual DNS server is routed in, and
     * [DnsTunnel] answers lookups. With [socksPort] (proxy mode) every app's
     * traffic is routed in and the full tunnel ([FullTunnel]) sends each
     * connection to Kavach's proxy on that port; bypass apps are left out.
     *
     * Calling it again while running swaps the interface in place: Android
     * moves apps to the new one, then the old one is closed.
     */
    @Synchronized
    private fun establish(socksPort: Int?): Boolean {
        val fd = buildInterface(full = socksPort != null) ?: return false

        val oldTun = tun
        val oldDns = tunnel
        if (fullTunnel) {
            FullTunnel.stop()
            fullTunnel = false
        }
        tunnel = null
        tun = fd
        if (socksPort != null) {
            if (!FullTunnel.start(this, fd.fd, socksPort)) {
                // Engine missing or broken: keep ad blocking going in DNS mode.
                tun = null
                closeQuietly(fd)
                oldDns?.stop()
                closeQuietly(oldTun)
                establish(socksPort = null)
                return false
            }
            fullTunnel = true
        } else {
            tunnel = DnsTunnel(this, fd).also { it.start() }
        }
        oldDns?.stop()
        closeQuietly(oldTun)
        return true
    }

    private fun buildInterface(full: Boolean): ParcelFileDescriptor? {
        val builder = Builder()
            .setSession(getString(R.string.app_name))
            .setConfigureIntent(openAppIntent())
        if (full) {
            builder.setMtu(FullTunnel.MTU)
                .addAddress(FullTunnel.ADDRESS_V4, 32)
                .addAddress(FullTunnel.ADDRESS_V6, 128)
                .addDnsServer(FullTunnel.DNS)
                .addRoute("::", 0) // IPv6 goes in too, so it can't leak around the proxy
            FullTunnel.ROUTES_V4.forEach { (address, prefix) -> builder.addRoute(address, prefix) }
            // The engine expects a non-blocking fd (the default).
        } else {
            builder.addAddress(VPN_ADDRESS, 32)
                .addDnsServer(VPN_DNS)
                .addRoute(VPN_DNS, 32) // only the virtual DNS server is routed into the tunnel
                .setBlocking(true)
        }
        try {
            // Our own traffic (blocklist downloads, DoH upstream, the free
            // proxies) must skip the VPN, otherwise it would loop back into it.
            builder.addDisallowedApplication(packageName)
        } catch (e: PackageManager.NameNotFoundException) {
            Log.e(TAG, "Could not exclude own package", e)
            return null
        }
        if (full) {
            ProxySettings(this).bypassApps.forEach { pkg ->
                try {
                    builder.addDisallowedApplication(pkg)
                } catch (_: PackageManager.NameNotFoundException) {
                    // Not installed.
                }
            }
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            builder.setMetered(false) // don't make Wi-Fi look metered to other apps
        }
        return try {
            builder.establish()
        } catch (e: Exception) {
            Log.e(TAG, "establish() failed", e)
            null
        }
    }

    private fun closeQuietly(fd: ParcelFileDescriptor?) {
        try {
            fd?.close()
        } catch (_: Exception) {
        }
    }

    /** Starts or stops proxy mode to match the saved setting. */
    private fun applyProxySetting() {
        val want = ProxySettings(this).enabled
        if (want && proxy == null) {
            proxy = ProxyManager(this) { port -> running && establish(port) }.also { it.start() }
        } else if (!want && proxy != null) {
            proxy?.stop()
            proxy = null
            establish(proxyPort = null)
        }
    }

    private fun observeProxyStatus() {
        statusJob?.cancel()
        statusJob = scope.launch {
            AdBlockState.proxy.collect { updateNotification(it) }
        }
    }

    private fun stopVpn() {
        running = false
        proxy?.stop()
        proxy = null
        statusJob?.cancel()
        statusJob = null
        synchronized(this) {
            if (fullTunnel) {
                FullTunnel.stop()
                fullTunnel = false
            }
            tunnel?.stop()
            tunnel = null
            closeQuietly(tun)
            tun = null
        }
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
        if (running) stopVpn()
        scope.cancel()
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
        val notification = buildNotification(AdBlockState.proxy.value)
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
        } else {
            0
        }
        ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, type)
    }

    private fun buildNotification(proxyState: AdBlockState.Proxy): Notification {
        val stop = PendingIntent.getService(
            this,
            1,
            Intent(this, AdBlockVpnService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val text = when (proxyState) {
            is AdBlockState.Proxy.Active -> getString(R.string.notification_text_proxy, proxyState.exitIp)
            is AdBlockState.Proxy.Connecting -> getString(R.string.notification_text_proxy_connecting)
            is AdBlockState.Proxy.Unavailable -> getString(R.string.notification_text_proxy_direct)
            AdBlockState.Proxy.Off -> getString(R.string.notification_text)
        }
        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_shield)
            .setContentTitle(getString(R.string.notification_title))
            .setContentText(text)
            .setContentIntent(openAppIntent())
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .addAction(0, getString(R.string.stop), stop)
        if (proxyState is AdBlockState.Proxy.Active && proxyState.poolSize > 1) {
            val next = PendingIntent.getService(
                this,
                2,
                Intent(this, AdBlockVpnService::class.java).setAction(ACTION_PROXY_NEXT),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            builder.addAction(0, getString(R.string.proxy_next), next)
        }
        return builder.build()
    }

    private fun updateNotification(proxyState: AdBlockState.Proxy) {
        if (!running) return
        try {
            getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, buildNotification(proxyState))
        } catch (_: SecurityException) {
            // Notification permission not granted; nothing to update.
        }
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
        private const val ACTION_PROXY_RESTART = "com.chinmay.kavach.PROXY_RESTART"
        private const val ACTION_PROXY_APPS = "com.chinmay.kavach.PROXY_APPS"
        private const val ACTION_PROXY_NEXT = "com.chinmay.kavach.PROXY_NEXT"
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

        /** Proxy mode was switched, or its Setu URL/token changed. No-op if Kavach is off. */
        fun restartProxy(ctx: Context) = send(ctx, ACTION_PROXY_RESTART)

        /** The list of apps that skip the proxy changed. */
        fun refreshProxyApps(ctx: Context) = send(ctx, ACTION_PROXY_APPS)

        /** Moves new connections to the next proxy. */
        fun nextProxy(ctx: Context) = send(ctx, ACTION_PROXY_NEXT)

        private fun send(ctx: Context, action: String) {
            if (AdBlockState.running.value) {
                ctx.startService(Intent(ctx, AdBlockVpnService::class.java).setAction(action))
            }
        }

        fun stop(ctx: Context) {
            ctx.startService(Intent(ctx, AdBlockVpnService::class.java).setAction(ACTION_STOP))
        }
    }
}
