package com.chinmay.prahari.watch

import android.app.AppOpsManager
import android.content.Context
import android.content.pm.PackageManager
import android.util.Log
import com.chinmay.prahari.core.Kind
import org.lsposed.hiddenapibypass.HiddenApiBypass
import java.lang.reflect.InvocationTargetException
import java.lang.reflect.Method

/**
 * Precision mode. Android keeps its own record of every app's last access to
 * each protected thing (the same record behind Settings → Privacy dashboard),
 * but only lets holders of GET_APP_OPS_STATS read it. That permission can be
 * granted once over adb:
 *
 *     adb shell pm grant com.chinmay.prahari android.permission.GET_APP_OPS_STATS
 *
 * With it, Prahari reads exact "app X used Y at time T for D ms" facts,
 * including clipboard reads, which no public API reveals.
 */
class OpsReader(context: Context) {
    private val ctx = context.applicationContext
    private val aom = ctx.getSystemService(AppOpsManager::class.java)

    data class Use(val pkg: String, val op: String, val kind: Kind, val last: Long, val duration: Long, val running: Boolean)

    fun granted(): Boolean =
        ctx.checkSelfPermission(PERMISSION) == PackageManager.PERMISSION_GRANTED

    /** True when precision mode works on this phone (granted, and the API answered). */
    fun available(): Boolean = granted() && methods() != null && validOps().isNotEmpty()

    fun read(): List<Use> {
        if (!granted()) return emptyList()
        val m = methods() ?: return emptyList()
        val ops = validOps()
        if (ops.isEmpty()) return emptyList()
        val list = try {
            m.getPackagesForOps.invoke(aom, ops.toTypedArray()) as? List<*>
        } catch (e: Exception) {
            Log.w(TAG, "getPackagesForOps failed: ${e.cause ?: e}")
            null
        } ?: return emptyList()

        val out = ArrayList<Use>()
        for (po in list) {
            if (po == null) continue
            try {
                val pkg = m.packageName.invoke(po) as String
                val entries = m.ops.invoke(po) as List<*>
                for (e in entries) {
                    if (e == null) continue
                    val op = m.opStr.invoke(e) as String
                    val kind = OPS[op] ?: continue
                    val last = m.lastAccess(e)
                    if (last <= 0) continue
                    out += Use(pkg, op, kind, last, m.lastDuration(e), m.running(e))
                }
            } catch (_: Exception) {
            }
        }
        return out
    }

    private class Methods(
        val getPackagesForOps: Method,
        val packageName: Method,
        val ops: Method,
        val opStr: Method,
        private val lastAccessFlags: Method?,
        private val time: Method?,
        private val lastDurationFlags: Method?,
        private val duration: Method?,
        private val isRunning: Method?,
    ) {
        fun lastAccess(e: Any): Long =
            (lastAccessFlags?.invoke(e, FLAGS) ?: time?.invoke(e)) as? Long ?: 0L

        fun lastDuration(e: Any): Long =
            ((lastDurationFlags?.invoke(e, FLAGS) ?: duration?.invoke(e)) as? Number)?.toLong()?.coerceAtLeast(0) ?: 0L

        fun running(e: Any): Boolean = isRunning?.invoke(e) as? Boolean ?: false
    }

    @Volatile private var cachedMethods: Methods? = null
    @Volatile private var methodsTried = false

    private fun methods(): Methods? {
        if (methodsTried) return cachedMethods
        synchronized(this) {
            if (methodsTried) return cachedMethods
            methodsTried = true
            cachedMethods = try {
                HiddenApiBypass.addHiddenApiExemptions("Landroid/app/AppOpsManager")
                val pkgOps = Class.forName("android.app.AppOpsManager\$PackageOps")
                val opEntry = Class.forName("android.app.AppOpsManager\$OpEntry")
                fun opt(c: Class<*>, name: String, vararg p: Class<*>) =
                    try { c.getMethod(name, *p) } catch (_: NoSuchMethodException) { null }
                Methods(
                    getPackagesForOps = AppOpsManager::class.java.getMethod("getPackagesForOps", Array<String>::class.java),
                    packageName = pkgOps.getMethod("getPackageName"),
                    ops = pkgOps.getMethod("getOps"),
                    opStr = opEntry.getMethod("getOpStr"),
                    lastAccessFlags = opt(opEntry, "getLastAccessTime", Int::class.javaPrimitiveType!!),
                    time = opt(opEntry, "getTime"),
                    lastDurationFlags = opt(opEntry, "getLastDuration", Int::class.javaPrimitiveType!!),
                    duration = opt(opEntry, "getDuration"),
                    isRunning = opt(opEntry, "isRunning"),
                )
            } catch (e: Throwable) {
                Log.w(TAG, "App ops API not reachable: $e")
                null
            }
            return cachedMethods
        }
    }

    @Volatile private var cachedOps: List<String>? = null

    /** Op names differ by Android version; keep the ones this phone knows. */
    private fun validOps(): List<String> {
        cachedOps?.let { return it }
        val m = methods() ?: return emptyList()
        val ok = OPS.keys.filter { op ->
            try {
                m.getPackagesForOps.invoke(aom, arrayOf(op))
                true
            } catch (e: InvocationTargetException) {
                e.cause !is IllegalArgumentException && e.cause !is SecurityException
            } catch (_: Exception) {
                false
            }
        }
        if (ok.isNotEmpty()) cachedOps = ok
        return ok
    }

    companion object {
        private const val TAG = "PrahariOps"
        const val PERMISSION = "android.permission.GET_APP_OPS_STATS"
        const val ADB_GRANT = "adb shell pm grant com.chinmay.prahari android.permission.GET_APP_OPS_STATS"

        /**
         * Accesses made by the app itself or through a system proxy on its
         * behalf (OP_FLAG_SELF | TRUSTED_PROXIED | UNTRUSTED_PROXIED). The
         * proxies' own entries (e.g. Play services fetching location for
         * someone else) are left out, as in Android's privacy dashboard.
         */
        private const val FLAGS = 0x1 or 0x8 or 0x10

        val OPS: Map<String, Kind> = linkedMapOf(
            "android:camera" to Kind.CAMERA,
            "android:phone_call_camera" to Kind.CAMERA,
            "android:record_audio" to Kind.MIC,
            "android:phone_call_microphone" to Kind.MIC,
            "android:fine_location" to Kind.LOCATION,
            "android:coarse_location" to Kind.LOCATION,
            "android:read_clipboard" to Kind.CLIPBOARD,
            "android:read_contacts" to Kind.CONTACTS,
            "android:read_call_log" to Kind.CALL_LOG,
            "android:read_sms" to Kind.SMS,
            "android:receive_sms" to Kind.SMS,
            "android:read_calendar" to Kind.CALENDAR,
            "android:read_phone_state" to Kind.PHONE,
            "android:read_phone_numbers" to Kind.PHONE,
            "android:body_sensors" to Kind.SENSORS,
            "android:activity_recognition" to Kind.ACTIVITY,
            "android:read_external_storage" to Kind.MEDIA,
            "android:read_media_images" to Kind.MEDIA,
            "android:read_media_video" to Kind.MEDIA,
            "android:read_media_audio" to Kind.MEDIA,
            "android:bluetooth_scan" to Kind.NEARBY,
            "android:nearby_wifi_devices" to Kind.NEARBY,
            "android:get_accounts" to Kind.ACCOUNTS,
        )
    }
}
