package com.chinmay.prahari.apps

import android.Manifest
import android.accessibilityservice.AccessibilityServiceInfo
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.provider.Settings
import android.view.accessibility.AccessibilityManager
import android.view.inputmethod.InputMethodManager

data class AppInfo(
    val pkg: String,
    val label: String,
    val uid: Int,
    val system: Boolean,
    val granted: Set<Perm>,
    /** Special permissions the app asks for; Android may or may not have allowed them. */
    val requestedSpecial: Set<Perm>,
    val exposure: Exposure,
    val stamp: String,
    val apks: List<String>,
    val installedAt: Long,
    val updatedAt: Long,
)

object Inventory {

    private val GROUPS: Map<String, Perm> = mapOf(
        Manifest.permission.CAMERA to Perm.CAMERA,
        Manifest.permission.RECORD_AUDIO to Perm.MIC,
        Manifest.permission.ACCESS_FINE_LOCATION to Perm.LOCATION_PRECISE,
        Manifest.permission.ACCESS_COARSE_LOCATION to Perm.LOCATION_APPROX,
        Manifest.permission.ACCESS_BACKGROUND_LOCATION to Perm.LOCATION_BACKGROUND,
        Manifest.permission.READ_CONTACTS to Perm.CONTACTS,
        Manifest.permission.WRITE_CONTACTS to Perm.CONTACTS,
        Manifest.permission.READ_CALL_LOG to Perm.CALL_LOG,
        Manifest.permission.WRITE_CALL_LOG to Perm.CALL_LOG,
        Manifest.permission.PROCESS_OUTGOING_CALLS to Perm.CALL_LOG,
        Manifest.permission.READ_SMS to Perm.SMS,
        Manifest.permission.RECEIVE_SMS to Perm.SMS,
        Manifest.permission.SEND_SMS to Perm.SMS,
        Manifest.permission.RECEIVE_MMS to Perm.SMS,
        Manifest.permission.READ_PHONE_STATE to Perm.PHONE,
        Manifest.permission.READ_PHONE_NUMBERS to Perm.PHONE,
        Manifest.permission.CALL_PHONE to Perm.PHONE,
        Manifest.permission.READ_CALENDAR to Perm.CALENDAR,
        Manifest.permission.WRITE_CALENDAR to Perm.CALENDAR,
        Manifest.permission.BODY_SENSORS to Perm.SENSORS,
        Manifest.permission.ACTIVITY_RECOGNITION to Perm.ACTIVITY,
        Manifest.permission.READ_EXTERNAL_STORAGE to Perm.MEDIA,
        "android.permission.READ_MEDIA_IMAGES" to Perm.MEDIA,
        "android.permission.READ_MEDIA_VIDEO" to Perm.MEDIA,
        "android.permission.READ_MEDIA_AUDIO" to Perm.MEDIA,
        "android.permission.BLUETOOTH_SCAN" to Perm.NEARBY,
        "android.permission.BLUETOOTH_CONNECT" to Perm.NEARBY,
        "android.permission.NEARBY_WIFI_DEVICES" to Perm.NEARBY,
        Manifest.permission.GET_ACCOUNTS to Perm.ACCOUNTS,
        "android.permission.POST_NOTIFICATIONS" to Perm.NOTIFICATIONS,
    )

    private val SPECIAL: Map<String, Perm> = mapOf(
        Manifest.permission.SYSTEM_ALERT_WINDOW to Perm.OVERLAY,
        "android.permission.MANAGE_EXTERNAL_STORAGE" to Perm.FILES_ALL,
        "android.permission.PACKAGE_USAGE_STATS" to Perm.USAGE,
        Manifest.permission.REQUEST_INSTALL_PACKAGES to Perm.INSTALL,
        "android.permission.QUERY_ALL_PACKAGES" to Perm.ALL_APPS,
    )

    fun load(ctx: Context, includeSystem: Boolean): List<AppInfo> {
        val pm = ctx.packageManager
        val exposures = exposures(ctx)
        @Suppress("DEPRECATION")
        val packages: List<PackageInfo> = pm.getInstalledPackages(PackageManager.GET_PERMISSIONS)
        return packages.mapNotNull { pi ->
            val ai = pi.applicationInfo ?: return@mapNotNull null
            if (pi.packageName == ctx.packageName) return@mapNotNull null
            val system = (ai.flags and ApplicationInfo.FLAG_SYSTEM) != 0 && (ai.flags and ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) == 0
            val exposure = exposures[pi.packageName] ?: Exposure()
            // Hide pure system plumbing unless it has a way to see your input.
            if (system && !includeSystem && !exposure.any) return@mapNotNull null
            info(ctx, pi, system, exposure)
        }.sortedBy { it.label.lowercase() }
    }

    fun one(ctx: Context, pkg: String): AppInfo? = try {
        @Suppress("DEPRECATION")
        val pi = ctx.packageManager.getPackageInfo(pkg, PackageManager.GET_PERMISSIONS)
        val ai = pi.applicationInfo!!
        val system = (ai.flags and ApplicationInfo.FLAG_SYSTEM) != 0 && (ai.flags and ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) == 0
        info(ctx, pi, system, exposures(ctx)[pkg] ?: Exposure())
    } catch (_: Exception) {
        null
    }

    private fun info(ctx: Context, pi: PackageInfo, system: Boolean, exposure: Exposure): AppInfo {
        val ai = pi.applicationInfo!!
        val granted = HashSet<Perm>()
        val special = HashSet<Perm>()
        val names = pi.requestedPermissions ?: emptyArray()
        val flags = pi.requestedPermissionsFlags ?: IntArray(0)
        for (i in names.indices) {
            val name = names[i] ?: continue
            SPECIAL[name]?.let { special += it }
            val group = GROUPS[name] ?: continue
            val isGranted = i < flags.size && (flags[i] and PackageInfo.REQUESTED_PERMISSION_GRANTED) != 0
            if (isGranted) granted += group
        }
        val version = if (android.os.Build.VERSION.SDK_INT >= 28) pi.longVersionCode else @Suppress("DEPRECATION") pi.versionCode.toLong()
        return AppInfo(
            pkg = pi.packageName,
            label = ctx.packageManager.getApplicationLabel(ai).toString(),
            uid = ai.uid,
            system = system,
            granted = granted,
            requestedSpecial = special,
            exposure = exposure,
            stamp = "$version:${pi.lastUpdateTime}",
            apks = listOf(ai.sourceDir) + (ai.splitSourceDirs?.toList() ?: emptyList()),
            installedAt = pi.firstInstallTime,
            updatedAt = pi.lastUpdateTime,
        )
    }

    /** Every app that can see what you type or what's on screen, and how. */
    fun exposures(ctx: Context): Map<String, Exposure> {
        val out = HashMap<String, Exposure>()
        fun edit(pkg: String?, f: (Exposure) -> Exposure) {
            if (pkg.isNullOrEmpty() || pkg == ctx.packageName) return
            out[pkg] = f(out[pkg] ?: Exposure())
        }

        val am = ctx.getSystemService(AccessibilityManager::class.java)
        try {
            for (s in am.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK)) {
                val caps = s.capabilities
                edit(s.resolveInfo?.serviceInfo?.packageName) {
                    it.copy(
                        accessibility = true,
                        readsScreen = it.readsScreen || (caps and AccessibilityServiceInfo.CAPABILITY_CAN_RETRIEVE_WINDOW_CONTENT) != 0,
                        filtersKeys = it.filtersKeys || (caps and AccessibilityServiceInfo.CAPABILITY_CAN_REQUEST_FILTER_KEY_EVENTS) != 0,
                    )
                }
            }
        } catch (_: Exception) {
        }

        val imm = ctx.getSystemService(InputMethodManager::class.java)
        val defaultIme = secure(ctx, Settings.Secure.DEFAULT_INPUT_METHOD)?.let { ComponentName.unflattenFromString(it)?.packageName }
        try {
            for (ime in imm.enabledInputMethodList) edit(ime.packageName) { it.copy(keyboard = true) }
        } catch (_: Exception) {
        }
        edit(defaultIme) { it.copy(keyboard = true, defaultKeyboard = true) }

        secure(ctx, "enabled_notification_listeners")?.split(':')?.forEach { c ->
            edit(ComponentName.unflattenFromString(c)?.packageName) { it.copy(notifications = true) }
        }

        try {
            ctx.getSystemService(DevicePolicyManager::class.java).activeAdmins?.forEach { c ->
                edit(c.packageName) { it.copy(deviceAdmin = true) }
            }
        } catch (_: Exception) {
        }

        secure(ctx, "autofill_service")?.let { s -> edit(ComponentName.unflattenFromString(s)?.packageName) { it.copy(autofill = true) } }
        (secure(ctx, "voice_interaction_service") ?: secure(ctx, "assistant"))?.let { s ->
            edit(ComponentName.unflattenFromString(s)?.packageName) { it.copy(assistant = true) }
        }
        return out
    }

    private fun secure(ctx: Context, key: String): String? = try {
        Settings.Secure.getString(ctx.contentResolver, key)?.takeIf { it.isNotBlank() }
    } catch (_: Exception) {
        // Android 12+ hides some keys from apps; treat as unknown.
        null
    }
}
