package com.chinmay.swar.ui

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.chinmay.swar.data.Auth
import com.chinmay.swar.data.InnerTube
import com.chinmay.swar.data.YtMusic
import com.chinmay.swar.web.UserAgent

/**
 * Sign in once, on Google's own page in a WebView. As soon as it lands back on
 * music.youtube.com signed in, the session cookie is kept and the page closes.
 * The password goes only to Google; Swar never sees it.
 */
class LoginActivity : ComponentActivity() {
    private lateinit var web: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        web = WebView(this)
        setContentView(web)
        ViewCompat.setOnApplyWindowInsetsListener(web) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            setSupportMultipleWindows(false)
            // Google refuses sign-in from browsers that say they're a WebView.
            userAgentString = UserAgent.chromeLike(WebSettings.getDefaultUserAgent(this@LoginActivity))
        }
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(web, true)
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val scheme = request.url.scheme
                return scheme != "https" // no intent:// or app links out of the sign-in
            }

            override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) = check(url)
            override fun onPageFinished(view: WebView, url: String?) = check(url)
        }
        // Back goes back inside the sign-in pages first.
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else finish()
            }
        })
        web.loadUrl(SIGN_IN)
    }

    private var done = false

    private fun check(url: String?) {
        if (done || url == null || !url.startsWith(InnerTube.ORIGIN)) return
        val cookie = CookieManager.getInstance().getCookie(InnerTube.ORIGIN) ?: return
        if (Auth.sapisid(cookie) == null) return
        done = true
        CookieManager.getInstance().flush()
        YtMusic.account.save(cookie)
        Toast.makeText(this, "Signed in", Toast.LENGTH_SHORT).show()
        finish()
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    private companion object {
        const val SIGN_IN = "https://accounts.google.com/ServiceLogin?ltmpl=music&service=youtube&passive=true" +
            "&continue=https%3A%2F%2Fwww.youtube.com%2Fsignin%3Faction_handle_signin%3Dtrue%26next%3Dhttps%253A%252F%252Fmusic.youtube.com%252F"
    }
}
