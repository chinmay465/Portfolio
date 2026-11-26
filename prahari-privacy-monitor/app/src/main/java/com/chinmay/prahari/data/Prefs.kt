package com.chinmay.prahari.data

import android.content.Context
import android.content.SharedPreferences

class Prefs(context: Context) {
    private val p: SharedPreferences = context.applicationContext.getSharedPreferences("prahari", Context.MODE_PRIVATE)

    var watching: Boolean
        get() = p.getBoolean("watching", true)
        set(v) = p.edit().putBoolean("watching", v).apply()

    var alerts: Boolean
        get() = p.getBoolean("alerts", true)
        set(v) = p.edit().putBoolean("alerts", v).apply()

    /** Alert even for apps on screen (off by default: that's usually you). */
    var alertForeground: Boolean
        get() = p.getBoolean("alert_fg", false)
        set(v) = p.edit().putBoolean("alert_fg", v).apply()

    var dnsWatch: Boolean
        get() = p.getBoolean("dns_watch", false)
        set(v) = p.edit().putBoolean("dns_watch", v).apply()

    var includeSystem: Boolean
        get() = p.getBoolean("include_system", false)
        set(v) = p.edit().putBoolean("include_system", v).apply()

    var retentionDays: Int
        get() = p.getInt("retention_days", 14)
        set(v) = p.edit().putInt("retention_days", v).apply()

    var lastPrune: Long
        get() = p.getLong("last_prune", 0)
        set(v) = p.edit().putLong("last_prune", v).apply()

    var canaryWord: String?
        get() = p.getString("canary", null)
        set(v) = p.edit().putString("canary", v).apply()

    var canarySince: Long
        get() = p.getLong("canary_since", 0)
        set(v) = p.edit().putLong("canary_since", v).apply()
}
