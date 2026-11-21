package com.chinmay.kavach.vpn

import android.content.Context
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI

/**
 * Holds the block and allow lists. The block list is the bundled starter list
 * merged with a downloaded hosts file; the allow list is what the user tapped
 * to unblock.
 */
object Blocklist {

    /** StevenBlack's unified hosts list: ads + malware, ~80k domains, MIT licensed. */
    const val SOURCE_URL = "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts"

    private const val DOWNLOADED_FILE = "hosts.txt"
    private const val BUNDLED_ASSET = "default_hosts.txt"
    private const val PREFS = "kavach"
    private const val KEY_ALLOW = "allowlist"

    @Volatile private var blocked: DomainSet = DomainSet.EMPTY
    @Volatile private var allowed: DomainSet = DomainSet.EMPTY
    @Volatile private var loaded = false

    fun isBlocked(domain: String): Boolean =
        blocked.matches(domain) && !allowed.matches(domain)

    fun hasDownloadedList(ctx: Context): Boolean =
        File(ctx.filesDir, DOWNLOADED_FILE).exists()

    @Synchronized
    fun ensureLoaded(ctx: Context) {
        if (!loaded) reload(ctx)
    }

    @Synchronized
    fun reload(ctx: Context) {
        val app = ctx.applicationContext
        val downloaded = File(app.filesDir, DOWNLOADED_FILE)
        val set = HashSet<String>(if (downloaded.exists()) 150_000 else 512)
        app.assets.open(BUNDLED_ASSET).bufferedReader().useLines { DomainSet.parseInto(it, set) }
        if (downloaded.exists()) {
            downloaded.bufferedReader().useLines { DomainSet.parseInto(it, set) }
        }
        blocked = DomainSet(set)
        allowed = DomainSet(prefs(app).getStringSet(KEY_ALLOW, emptySet())!!.toHashSet())
        loaded = true
        AdBlockState.blocklistSize.value = set.size
        AdBlockState.allowlistSize.value = allowed.size
    }

    /** Downloads the hosts list and reloads. Blocking — call off the main thread. */
    @Throws(IOException::class)
    fun download(ctx: Context): Int {
        val app = ctx.applicationContext
        val conn = URI(SOURCE_URL).toURL().openConnection() as HttpURLConnection
        conn.connectTimeout = 15_000
        conn.readTimeout = 30_000
        try {
            if (conn.responseCode != HttpURLConnection.HTTP_OK) {
                throw IOException("Blocklist download failed: HTTP ${conn.responseCode}")
            }
            val tmp = File(app.filesDir, "$DOWNLOADED_FILE.tmp")
            conn.inputStream.use { input -> tmp.outputStream().use { input.copyTo(it) } }
            if (!tmp.renameTo(File(app.filesDir, DOWNLOADED_FILE))) {
                throw IOException("Could not save blocklist")
            }
        } finally {
            conn.disconnect()
        }
        reload(app)
        return AdBlockState.blocklistSize.value
    }

    @Synchronized
    fun allow(ctx: Context, domain: String) {
        val p = prefs(ctx)
        val next = p.getStringSet(KEY_ALLOW, emptySet())!!.toHashSet().apply { add(domain) }
        p.edit().putStringSet(KEY_ALLOW, next).apply()
        allowed = DomainSet(next)
        AdBlockState.allowlistSize.value = next.size
    }

    @Synchronized
    fun clearAllowlist(ctx: Context) {
        prefs(ctx).edit().remove(KEY_ALLOW).apply()
        allowed = DomainSet.EMPTY
        AdBlockState.allowlistSize.value = 0
    }

    private fun prefs(ctx: Context) =
        ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
