package com.chinmay.swar.data

import android.content.Context
import android.webkit.CookieManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * The signed-in YouTube Music session: the music.youtube.com cookies, kept in
 * the app's private storage (no backups, see data_extraction_rules.xml).
 */
class Account(private val context: Context) {
    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    val cookie: String? get() = prefs.getString(KEY_COOKIE, null)

    private val _signedIn = MutableStateFlow(Auth.sapisid(cookie) != null)
    val signedIn: StateFlow<Boolean> = _signedIn.asStateFlow()

    fun save(cookieHeader: String) {
        prefs.edit().putString(KEY_COOKIE, cookieHeader).apply()
        _signedIn.value = Auth.sapisid(cookieHeader) != null
    }

    fun signOut() {
        prefs.edit().remove(KEY_COOKIE).apply()
        _signedIn.value = false
        runCatching {
            CookieManager.getInstance().removeAllCookies(null)
            CookieManager.getInstance().flush()
        }
    }

    /**
     * Swar 1.x played YouTube Music in a WebView, whose cookie store still holds
     * that sign-in. Carry it over once, so updating doesn't sign anyone out.
     */
    fun importWebViewSession(): Boolean {
        if (prefs.getBoolean(KEY_IMPORTED, false)) return false
        prefs.edit().putBoolean(KEY_IMPORTED, true).apply()
        if (_signedIn.value) return false
        val fromWebView = runCatching { CookieManager.getInstance().getCookie(InnerTube.ORIGIN) }.getOrNull()
        if (Auth.sapisid(fromWebView) == null) return false
        save(fromWebView!!)
        return true
    }

    private companion object {
        const val PREFS = "swar_account"
        const val KEY_COOKIE = "cookie"
        const val KEY_IMPORTED = "imported_webview_session"
    }
}
