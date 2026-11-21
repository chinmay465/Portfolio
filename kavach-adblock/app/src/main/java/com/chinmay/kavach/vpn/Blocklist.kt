package com.chinmay.kavach.vpn

import android.content.Context
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI

/**
 * Holds the domain lists: the bundled starter list merged with a downloaded
 * hosts file, plus the user's own blocks and allows (see [DomainRules]).
 */
object Blocklist {

    /** StevenBlack's unified hosts list: ads + malware, ~80k domains, MIT licensed. */
    const val SOURCE_URL = "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts"

    private const val DOWNLOADED_FILE = "hosts.txt"
    private const val BUNDLED_ASSET = "default_hosts.txt"
    private const val PREFS = "kavach"
    private const val KEY_ALLOW = "allowlist"
    private const val KEY_CUSTOM = "custom_blocks"
    private const val MAX_LIST_BYTES = 20L * 1024 * 1024

    @Volatile private var list: DomainSet = DomainSet.EMPTY
    @Volatile private var custom: DomainSet = DomainSet.EMPTY
    @Volatile private var allowed: DomainSet = DomainSet.EMPTY
    @Volatile private var loaded = false

    fun isBlocked(domain: String): Boolean = DomainRules.isBlocked(domain, list, custom, allowed)

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
        list = DomainSet(set)
        AdBlockState.blocklistSize.value = set.size
        applyRules(readSet(app, KEY_CUSTOM), readSet(app, KEY_ALLOW))
        loaded = true
    }

    /** Downloads the hosts list and reloads. Blocking — call off the main thread. */
    @Throws(IOException::class)
    fun download(ctx: Context): Int {
        val app = ctx.applicationContext
        val conn = URI(SOURCE_URL).toURL().openConnection() as HttpURLConnection
        conn.connectTimeout = 15_000
        conn.readTimeout = 30_000
        // Don't send the default User-Agent, which names the phone model and Android version.
        conn.setRequestProperty("User-Agent", "Kavach")
        conn.useCaches = false
        try {
            if (conn.responseCode != HttpURLConnection.HTTP_OK) {
                throw IOException("Blocklist download failed: HTTP ${conn.responseCode}")
            }
            val tmp = File(app.filesDir, "$DOWNLOADED_FILE.tmp")
            conn.inputStream.use { input ->
                tmp.outputStream().use { out ->
                    val buf = ByteArray(64 * 1024)
                    var total = 0L
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        total += n
                        if (total > MAX_LIST_BYTES) {
                            tmp.delete()
                            throw IOException("Blocklist is unexpectedly large")
                        }
                        out.write(buf, 0, n)
                    }
                }
            }
            if (!tmp.renameTo(File(app.filesDir, DOWNLOADED_FILE))) {
                throw IOException("Could not save blocklist")
            }
        } finally {
            conn.disconnect()
        }
        reload(app)
        return AdBlockState.blocklistSize.value
    }

    /** Your own block: always wins, covers subdomains. */
    @Synchronized
    fun block(ctx: Context, domain: String) {
        val (c, a) = DomainRules.block(domain, readSet(ctx, KEY_CUSTOM), readSet(ctx, KEY_ALLOW))
        save(ctx, c, a)
        AdBlockState.markDomain(domain, blocked = true)
    }

    @Synchronized
    fun allow(ctx: Context, domain: String) {
        val (c, a) = DomainRules.allow(domain, readSet(ctx, KEY_CUSTOM), readSet(ctx, KEY_ALLOW))
        save(ctx, c, a)
        AdBlockState.markDomain(domain, blocked = false)
    }

    /** Your rules: (domains you blocked, domains you allowed), sorted. */
    fun rules(ctx: Context): Pair<List<String>, List<String>> =
        readSet(ctx, KEY_CUSTOM).sorted() to readSet(ctx, KEY_ALLOW).sorted()

    @Synchronized
    fun removeRule(ctx: Context, domain: String, wasBlock: Boolean) {
        val c = readSet(ctx, KEY_CUSTOM)
        val a = readSet(ctx, KEY_ALLOW)
        if (wasBlock) save(ctx, c - domain, a) else save(ctx, c, a - domain)
    }

    private fun save(ctx: Context, customSet: Set<String>, allowSet: Set<String>) {
        prefs(ctx).edit()
            .putStringSet(KEY_CUSTOM, HashSet(customSet))
            .putStringSet(KEY_ALLOW, HashSet(allowSet))
            .apply()
        applyRules(customSet, allowSet)
    }

    private fun applyRules(customSet: Set<String>, allowSet: Set<String>) {
        custom = DomainSet(HashSet(customSet))
        allowed = DomainSet(HashSet(allowSet))
        AdBlockState.ruleCount.value = customSet.size + allowSet.size
    }

    private fun readSet(ctx: Context, key: String): Set<String> =
        prefs(ctx).getStringSet(key, emptySet())!!.toHashSet()

    private fun prefs(ctx: Context) =
        ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
