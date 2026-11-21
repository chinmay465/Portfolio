package com.chinmay.swar

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.ServiceWorkerClientCompat
import androidx.webkit.ServiceWorkerControllerCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.chinmay.swar.playback.PlaybackService
import com.chinmay.swar.playback.PlayerBridge
import com.chinmay.swar.playback.PlayerCommand
import com.chinmay.swar.playback.PlayerState
import com.chinmay.swar.web.AdFilter
import com.chinmay.swar.web.NavPolicy
import com.chinmay.swar.web.UserAgent
import org.json.JSONException
import org.json.JSONObject
import java.io.ByteArrayInputStream

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private val pageScript by lazy { assets.open("swar.js").bufferedReader().use { it.readText() } }
    private var documentStartScript = false

    private val commandSink: (PlayerCommand) -> Unit = { command ->
        webView.post { webView.evaluateJavascript(command.js, null) }
    }
    private val closeListener: () -> Unit = { runOnUiThread { finishAndRemoveTask() } }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        WindowCompat.setDecorFitsSystemWindows(window, false)
        val root = FrameLayout(this).apply { setBackgroundColor(getColor(R.color.page_bg)) }
        webView = WebView(this).apply { setBackgroundColor(getColor(R.color.page_bg)) }
        root.addView(webView, FrameLayout.LayoutParams(MATCH, MATCH))
        setContentView(root)
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }
        WindowCompat.getInsetsController(window, root).apply {
            isAppearanceLightStatusBars = false
            isAppearanceLightNavigationBars = false
        }

        configureWebView()
        PlayerBridge.commandSink = commandSink
        PlayerBridge.closeListener = closeListener

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // Leaving the app must not stop the music, so never finish on back.
                if (webView.canGoBack()) webView.goBack() else moveTaskToBack(true)
            }
        })

        val restored = savedInstanceState != null && webView.restoreState(savedInstanceState) != null
        if (!restored) webView.loadUrl(linkFrom(intent) ?: HOME)
        askForNotificationPermission()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        linkFrom(intent)?.let { webView.loadUrl(it) }
    }

    // No onPause/onStop override that pauses the WebView: WebView.onPause()
    // is what would stop playback in the background.
    override fun onStop() {
        super.onStop()
        CookieManager.getInstance().flush()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onDestroy() {
        if (PlayerBridge.commandSink === commandSink) PlayerBridge.commandSink = null
        if (PlayerBridge.closeListener === closeListener) PlayerBridge.closeListener = null
        if (isFinishing) {
            PlaybackService.stop(this)
            PlayerBridge.publish(PlayerState())
        }
        (webView.parent as? ViewGroup)?.removeView(webView)
        webView.destroy()
        super.onDestroy()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false // lets notification/headset buttons start playback
            allowFileAccess = false
            allowContentAccess = false
            setSupportMultipleWindows(false)
            userAgentString = UserAgent.chromeLike(WebSettings.getDefaultUserAgent(this@MainActivity))
        }
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, true) // Google sign-in hops across domains
        }
        // Keep the renderer at foreground priority while the app is in the background.
        webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false)

        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(
                webView, BRIDGE_NAME, setOf(ORIGIN),
                WebViewCompat.WebMessageListener { _, message, _, isMainFrame, _ ->
                    if (isMainFrame) message.data?.let(::onPageMessage)
                },
            )
        } else {
            webView.addJavascriptInterface(LegacyBridge(), BRIDGE_NAME)
        }

        documentStartScript = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)
        if (documentStartScript) {
            WebViewCompat.addDocumentStartJavaScript(webView, pageScript, setOf(ORIGIN))
        }

        if (WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_BASIC_USAGE) &&
            WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_SHOULD_INTERCEPT_REQUEST)
        ) {
            ServiceWorkerControllerCompat.getInstance().setServiceWorkerClient(object : ServiceWorkerClientCompat() {
                override fun shouldInterceptRequest(request: WebResourceRequest): WebResourceResponse? =
                    blockedOrNull(request)
            })
        }

        webView.webViewClient = PageClient()
        webView.webChromeClient = WebChromeClient()
    }

    private inner class PageClient : WebViewClient() {

        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
            blockedOrNull(request)

        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
            when (NavPolicy.decide(request.url.toString())) {
                NavPolicy.Action.IN_APP -> false
                NavPolicy.Action.EXTERNAL -> {
                    // Frames (embedded sign-in widgets etc.) may load anywhere; only top-level links leave the app.
                    if (request.isForMainFrame) openExternally(request.url)
                    request.isForMainFrame
                }
                NavPolicy.Action.BLOCK -> true
            }

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            // Older WebView without document-start scripts: inject as early as we can.
            if (!documentStartScript && url != null && url.startsWith(ORIGIN)) {
                view.evaluateJavascript(pageScript, null)
            }
        }

        override fun onPageFinished(view: WebView, url: String?) {
            CookieManager.getInstance().flush()
        }

        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            // The renderer died (crash or killed for memory). Start over with a fresh WebView.
            PlayerBridge.publish(PlayerState())
            recreate()
            return true
        }
    }

    /** Fallback for WebView builds without WebMessageListener (very old System WebView). */
    private inner class LegacyBridge {
        @JavascriptInterface
        fun postMessage(data: String) {
            runOnUiThread {
                if (Uri.parse(webView.url ?: "").host == HOST) onPageMessage(data)
            }
        }
    }

    private fun onPageMessage(raw: String) {
        val o = try {
            JSONObject(raw)
        } catch (e: JSONException) {
            return
        }
        if (o.optString("type") != "state") return
        val state = PlayerState(
            title = o.optString("title"),
            artist = o.optString("artist"),
            album = o.optString("album"),
            artworkUrl = o.optString("artwork"),
            playing = o.optBoolean("playing"),
            durationMs = o.optLong("duration"),
            positionMs = o.optLong("position"),
            inAd = o.optBoolean("ad"),
        )
        PlayerBridge.publish(state)
        if (state.playing) PlaybackService.ensureRunning(this)
    }

    private fun openExternally(uri: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE))
        } catch (e: ActivityNotFoundException) {
            // Nothing can open it; ignore the tap.
        }
    }

    private fun linkFrom(intent: Intent?): String? =
        intent?.data?.takeIf { it.scheme == "https" && it.host == HOST }?.toString()

    private fun askForNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        }
    }

    private companion object {
        const val HOST = "music.youtube.com"
        const val ORIGIN = "https://$HOST"
        const val HOME = "$ORIGIN/"
        const val BRIDGE_NAME = "SwarBridge"
        const val MATCH = ViewGroup.LayoutParams.MATCH_PARENT

        fun blockedOrNull(request: WebResourceRequest): WebResourceResponse? =
            if (AdFilter.shouldBlock(request.url.toString())) {
                WebResourceResponse("text/plain", "utf-8", ByteArrayInputStream(ByteArray(0)))
            } else {
                null
            }
    }
}
