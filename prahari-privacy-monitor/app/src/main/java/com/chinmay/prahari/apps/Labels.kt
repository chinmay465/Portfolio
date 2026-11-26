package com.chinmay.prahari.apps

import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.util.LruCache
import androidx.core.graphics.drawable.toBitmap
import java.util.concurrent.ConcurrentHashMap

/** App names and icons, cached. */
object Labels {
    private val names = ConcurrentHashMap<String, String>()
    private val icons = object : LruCache<String, Bitmap>(160) {}

    fun name(ctx: Context, pkg: String?): String {
        if (pkg == null) return "Unknown app"
        return names.getOrPut(pkg) {
            try {
                val pm = ctx.packageManager
                pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
            } catch (_: PackageManager.NameNotFoundException) {
                pkg
            }
        }
    }

    fun icon(ctx: Context, pkg: String): Bitmap? {
        icons.get(pkg)?.let { return it }
        return try {
            val px = (40 * ctx.resources.displayMetrics.density).toInt()
            ctx.packageManager.getApplicationIcon(pkg).toBitmap(px, px).also { icons.put(pkg, it) }
        } catch (_: Exception) {
            null
        }
    }

    fun isSystem(ctx: Context, pkg: String): Boolean = try {
        val ai = ctx.packageManager.getApplicationInfo(pkg, 0)
        (ai.flags and ApplicationInfo.FLAG_SYSTEM) != 0 && (ai.flags and ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) == 0
    } catch (_: Exception) {
        false
    }

    /** "Camera app" or "Camera app, Zoom + 1 more". */
    fun names(ctx: Context, pkgs: List<String>, max: Int = 2): String {
        if (pkgs.isEmpty()) return "Unknown app"
        val shown = pkgs.take(max).joinToString(", ") { name(ctx, it) }
        return if (pkgs.size > max) "$shown + ${pkgs.size - max} more" else shown
    }
}
