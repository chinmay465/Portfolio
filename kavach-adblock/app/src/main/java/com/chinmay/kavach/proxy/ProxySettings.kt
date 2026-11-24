package com.chinmay.kavach.proxy

import android.content.Context
import android.os.Build

/**
 * Proxy mode settings, in the app's private storage (excluded from backups
 * like the rest of Kavach's data).
 */
class ProxySettings(ctx: Context) {

    private val prefs = ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    var enabled: Boolean
        get() = supported && prefs.getBoolean(KEY_ENABLED, false)
        set(value) = prefs.edit().putBoolean(KEY_ENABLED, value).apply()

    var setuUrl: String
        get() = prefs.getString(KEY_URL, null) ?: SetuClient.DEFAULT_URL
        set(value) = prefs.edit().putString(KEY_URL, value).apply()

    var token: String
        get() = prefs.getString(KEY_TOKEN, null).orEmpty()
        set(value) = prefs.edit().putString(KEY_TOKEN, value.trim()).apply()

    /** 0 = switch only when the current proxy fails. */
    var rotateMinutes: Int
        get() = prefs.getInt(KEY_ROTATE, 0)
        set(value) = prefs.edit().putInt(KEY_ROTATE, value).apply()

    /** Apps that skip the proxy (and the VPN, so they also skip ad blocking). */
    var bypassApps: Set<String>
        get() = prefs.getStringSet(KEY_BYPASS, null)?.toSet() ?: DEFAULT_BYPASS
        set(value) = prefs.edit().putStringSet(KEY_BYPASS, value).apply()

    companion object {
        private const val PREFS = "kavach_proxy"
        private const val KEY_ENABLED = "enabled"
        private const val KEY_URL = "setu_url"
        private const val KEY_TOKEN = "setu_token"
        private const val KEY_ROTATE = "rotate_minutes"
        private const val KEY_BYPASS = "bypass_apps"

        /** VpnService.Builder.setHttpProxy needs Android 10. */
        val supported: Boolean get() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q

        val ROTATE_CHOICES = intArrayOf(0, 5, 15, 30, 60)

        /**
         * Payment and banking apps skip the proxy by default: a free proxy's
         * operator is unknown, and these apps often refuse to work through one.
         * Names that aren't installed are ignored.
         */
        val DEFAULT_BYPASS: Set<String> = setOf(
            "com.google.android.apps.nbu.paisa.user", // Google Pay
            "com.phonepe.app",
            "net.one97.paytm",
            "com.paytmmoney",
            "in.org.npci.upiapp", // BHIM
            "com.sbi.lotusintouch", // YONO SBI
            "com.csam.icici.bank.imobile",
            "com.snapwork.hdfc",
            "com.axis.mobile",
            "com.msf.kbank.mobile", // Kotak
        )
    }
}
