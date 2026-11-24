package com.chinmay.swar

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.ConnectivityManager
import android.net.Network
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.webkit.WebResourceError
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.ProgressBar
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
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
import com.chinmay.swar.ui.Shell
import com.chinmay.swar.web.AdFilter
import com.chinmay.swar.web.NavPolicy
import com.chinmay.swar.web.UserAgent
import org.json.JSONException
import org.json.JSONObject
import java.io.ByteArrayInputStream

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var shell: Shell
    private val handler = Handler(Looper.getMainLooper())
    private var mainFrameFailed = false
    /** The page reloaded onto the song mid-switch; hide the card once it plays. */
    private var switchSurvivedReload = false
    private val revealFallback = Runnable { shell.showPage() }
    /** The now-playing page is open (reported by the page script). Back minimises it first. */
    private var playerOpen = false

    private val backCallback = object : OnBackPressedCallback(true) {
        override fun handleOnBackPressed() {
            if (playerOpen) {
                playerOpen = false
                updateBackCallback()
                webView.evaluateJavascript(PlayerCommand.CollapsePlayer.js) { result ->
                    if (result != "true") leavePage()
                }
                return
            }
            leavePage()
        }
    }

    // Leaving the app must not stop the music, so never finish on back.
    private fun leavePage() {
        if (webView.canGoBack()) webView.goBack() else moveTaskToBack(true)
    }

    // Back online after an error: retry without waiting for a tap.
    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            runOnUiThread { if (shell.offlineVisible) retry() }
        }
    }
    private val pageScript by lazy { assets.open("swar.js").bufferedReader().use { it.readText() } }
    private var documentStartScript = false

    private val commandSink: (PlayerCommand) -> Unit = { command ->
        webView.post { webView.evaluateJavascript(command.js, null) }
    }
    private val closeListener: () -> Unit = { runOnUiThread { finishAndRemoveTask() } }

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen().setOnExitAnimationListener { splash ->
            // Hand over to the loading screen, which shows the same bars.
            splash.view.animate().alpha(0f).setDuration(260).withEndAction { splash.remove() }.start()
        }
        super.onCreate(savedInstanceState)

        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContentView(R.layout.activity_main)
        val root = findViewById<View>(R.id.root)
        webView = findViewById(R.id.web)
        shell = Shell(
            loading = findViewById(R.id.loading),
            loadingStatus = findViewById<TextView>(R.id.loading_status),
            offline = findViewById(R.id.offline),
            switching = findViewById(R.id.switching),
            progress = findViewById<ProgressBar>(R.id.progress),
            onRetry = ::retry,
        )
        // Never leave someone staring at the loading screen.
        handler.postDelayed(revealFallback, MAX_LOADING_MS)
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

        onBackPressedDispatcher.addCallback(this, backCallback)
        updateBackCallback()
        getSystemService(ConnectivityManager::class.java).registerDefaultNetworkCallback(networkCallback)

        // Only the page address is kept across process death (see onSaveInstanceState).
        val savedUrl = savedInstanceState?.getString(STATE_URL)?.takeIf { it.startsWith(ORIGIN) }
        webView.loadUrl(linkFrom(intent) ?: savedUrl ?: HOME)
        askForNotificationPermission()
        CrashLog.showIfAny(this)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        linkFrom(intent)?.let { webView.loadUrl(it) }
    }

    // No onPause/onStop override that pauses the WebView: WebView.onPause()
    // is what would stop playback in the background.
    override fun onStop() {
        super.onStop()
        // Swar plays songs, not videos; this re-checks right as the screen goes off.
        webView.evaluateJavascript(PlayerCommand.EnterBackground.js, null)
        CookieManager.getInstance().flush()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        // Not webView.saveState(): for YouTube Music it serialises the whole
        // back/forward history with page state, which goes past Android's ~1 MB
        // limit and kills the app (TransactionTooLargeException) every time it
        // leaves the screen. The current address is all that's worth keeping.
        webView.url?.takeIf { it.startsWith(ORIGIN) }?.let { outState.putString(STATE_URL, it) }
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        shell.release()
        runCatching { getSystemService(ConnectivityManager::class.java).unregisterNetworkCallback(networkCallback) }
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
            // Rasterise tiles just outside the viewport too, so fast scrolls and
            // the player sliding in don't show blank or late-painted areas.
            offscreenPreRaster = true
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
        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, newProgress: Int) = shell.onProgress(newProgress)
        }
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
            mainFrameFailed = false
            playerOpen = false
            updateBackCallback()
            switchSurvivedReload = shell.switchingVisible
            // Older WebView without document-start scripts: inject as early as we can.
            if (!documentStartScript && url != null && url.startsWith(ORIGIN)) {
                view.evaluateJavascript(pageScript, null)
            }
        }

        override fun onPageFinished(view: WebView, url: String?) {
            CookieManager.getInstance().flush()
            if (mainFrameFailed) return
            if (url != null && url.startsWith(ORIGIN)) {
                // The page script says "ready" once the UI has drawn; this is the backstop.
                handler.removeCallbacks(revealFallback)
                handler.postDelayed(revealFallback, READY_FALLBACK_MS)
            } else {
                shell.showPage() // sign-in pages have no page script
            }
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (!request.isForMainFrame) return
            mainFrameFailed = true
            handler.removeCallbacks(revealFallback)
            shell.showOffline()
        }

        override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) {
            updateBackCallback()
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
        when (o.optString("type")) {
            "ready" -> {
                handler.removeCallbacks(revealFallback)
                if (!mainFrameFailed) shell.showPage()
                return
            }
            "switch" -> {
                if (o.optString("phase") == "start") {
                    shell.showSwitching(o.optString("title"))
                } else {
                    switchSurvivedReload = false
                    shell.hideSwitching()
                }
                return
            }
            "player" -> {
                playerOpen = o.optBoolean("open")
                updateBackCallback()
                return
            }
            "diag" -> {
                SwitchReport.show(this, o.toString(2))
                return
            }
            "state" -> Unit
            else -> return
        }
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
        if (switchSurvivedReload && state.playing && !state.inAd) {
            switchSurvivedReload = false
            shell.hideSwitching()
        }
        if (state.playing) PlaybackService.ensureRunning(this)
    }

    private fun retry() {
        shell.showLoading()
        handler.removeCallbacks(revealFallback)
        handler.postDelayed(revealFallback, MAX_LOADING_MS)
        if (webView.url.isNullOrEmpty()) webView.loadUrl(HOME) else webView.reload()
    }

    /**
     * Android 12+ moves a root activity to the background on Back instead of
     * finishing it, with the predictive-back animation. So at the top of the
     * page history, with the player minimised, let the system handle Back.
     * Older versions would finish the activity (and stop the music), so there
     * Swar always handles it.
     */
    private fun updateBackCallback() {
        backCallback.isEnabled = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || playerOpen || webView.canGoBack()
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
        const val STATE_URL = "swar.url"
        const val MAX_LOADING_MS = 12_000L
        const val READY_FALLBACK_MS = 2_500L

        fun blockedOrNull(request: WebResourceRequest): WebResourceResponse? =
            if (AdFilter.shouldBlock(request.url.toString())) {
                WebResourceResponse("text/plain", "utf-8", ByteArrayInputStream(ByteArray(0)))
            } else {
                null
            }
    }
}
