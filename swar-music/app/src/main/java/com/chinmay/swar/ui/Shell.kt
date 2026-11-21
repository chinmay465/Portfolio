package com.chinmay.swar.ui

import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.animation.DecelerateInterpolator
import android.view.animation.PathInterpolator
import android.widget.ProgressBar
import android.widget.TextView
import com.chinmay.swar.R

/**
 * The native screens around the YouTube Music page: the loading screen shown
 * until the page has drawn, the offline screen, and the load progress line.
 */
class Shell(
    private val loading: View,
    private val loadingStatus: TextView,
    private val offline: View,
    private val switching: View,
    private val progress: ProgressBar,
    private val onRetry: () -> Unit,
) {
    private val handler = Handler(Looper.getMainLooper())
    private val emphasized = PathInterpolator(0.2f, 0f, 0f, 1f)
    private val density = loading.resources.displayMetrics.density

    var pageVisible = false
        private set
    val offlineVisible get() = offline.visibility == View.VISIBLE

    private val slowNotice = Runnable { loadingStatus.crossfadeText(R.string.loading_status_slow) }
    private val switchTimeout = Runnable { hideSwitching() }
    private var switchShownAt = 0L

    val switchingVisible get() = switching.visibility == View.VISIBLE

    /** A music video is being swapped for its song: small card over the page. */
    fun showSwitching(title: String) {
        switching.findViewById<TextView>(R.id.switching_detail).apply {
            text = title
            visibility = if (title.isBlank()) View.GONE else View.VISIBLE
        }
        handler.removeCallbacks(switchTimeout)
        handler.postDelayed(switchTimeout, SWITCH_MAX_MS)
        switchShownAt = android.os.SystemClock.uptimeMillis()
        if (switching.visibility == View.VISIBLE) return
        val card = switching.findViewById<View>(R.id.switching_card)
        switching.animate().cancel()
        card.animate().cancel()
        switching.alpha = 0f
        switching.visibility = View.VISIBLE
        card.scaleX = 0.92f
        card.scaleY = 0.92f
        card.translationY = 12 * density
        switching.animate().alpha(1f).setStartDelay(0).setDuration(160).start()
        card.animate().scaleX(1f).scaleY(1f).translationY(0f)
            .setStartDelay(0).setDuration(320).setInterpolator(emphasized).start()
    }

    /** Song is playing (or there was nothing to switch to). Short minimum so it never just flickers. */
    fun hideSwitching() {
        handler.removeCallbacks(switchTimeout)
        if (switching.visibility != View.VISIBLE) return
        val shownFor = android.os.SystemClock.uptimeMillis() - switchShownAt
        val delay = (MIN_SWITCH_MS - shownFor).coerceAtLeast(0)
        val card = switching.findViewById<View>(R.id.switching_card)
        card.animate().scaleX(0.96f).scaleY(0.96f).setStartDelay(delay).setDuration(200).start()
        switching.animate().alpha(0f).setStartDelay(delay).setDuration(220)
            .withEndAction { switching.visibility = View.GONE }
            .start()
    }

    init {
        offline.findViewById<View>(R.id.offline_retry).setOnClickListener { onRetry() }
        enter(loading, listOf(R.id.loading_eq, R.id.loading_title, R.id.loading_subtitle, R.id.loading_status))
        handler.postDelayed(slowNotice, SLOW_MS)
    }

    /** YouTube Music has drawn its UI: fade the loading screen away. */
    fun showPage() {
        if (pageVisible) return
        pageVisible = true
        handler.removeCallbacks(slowNotice)
        hideOffline()
        if (loading.visibility != View.VISIBLE) return
        loading.animate().cancel()
        loading.animate()
            .alpha(0f).scaleX(1.06f).scaleY(1.06f)
            .setDuration(380).setInterpolator(emphasized)
            .withEndAction { loading.visibility = View.GONE }
            .start()
    }

    /** The page couldn't load: show the offline screen. */
    fun showOffline() {
        pageVisible = false
        handler.removeCallbacks(slowNotice)
        loading.animate().cancel()
        loading.visibility = View.GONE
        progress.visibility = View.INVISIBLE
        if (offline.visibility == View.VISIBLE) return
        offline.alpha = 1f
        offline.visibility = View.VISIBLE
        enter(offline, listOf(R.id.offline_icon, R.id.offline_title, R.id.offline_message, R.id.offline_retry))
    }

    /** Retrying after an error: back to the loading screen. */
    fun showLoading() {
        pageVisible = false
        loadingStatus.setText(R.string.loading_status)
        loading.animate().cancel()
        loading.alpha = 1f
        loading.scaleX = 1f
        loading.scaleY = 1f
        loading.visibility = View.VISIBLE
        hideOffline()
        handler.removeCallbacks(slowNotice)
        handler.postDelayed(slowNotice, SLOW_MS)
    }

    private fun hideOffline() {
        if (offline.visibility != View.VISIBLE) return
        offline.animate().cancel()
        offline.animate().alpha(0f).setDuration(220).withEndAction {
            offline.visibility = View.GONE
            offline.alpha = 1f
        }.start()
    }

    fun onProgress(percent: Int) {
        progress.animate().cancel()
        if (percent >= 100) {
            progress.setProgress(100, true)
            progress.animate().alpha(0f).setStartDelay(250).setDuration(300)
                .withEndAction {
                    progress.visibility = View.INVISIBLE
                    progress.progress = 0
                }.start()
            return
        }
        progress.alpha = 1f
        progress.visibility = View.VISIBLE
        progress.setProgress(percent, true)
    }

    fun release() {
        handler.removeCallbacksAndMessages(null)
    }

    /** Children rise and fade in one after another. */
    private fun enter(container: View, ids: List<Int>) {
        ids.forEachIndexed { i, id ->
            val child = container.findViewById<View>(id)
            child.alpha = 0f
            child.translationY = 18 * density
            child.animate()
                .alpha(1f).translationY(0f)
                .setStartDelay(120L + i * 70L).setDuration(460)
                .setInterpolator(DecelerateInterpolator(2.2f))
                .start()
        }
    }

    private fun TextView.crossfadeText(text: Int) {
        animate().alpha(0f).setStartDelay(0).setDuration(180).withEndAction {
            setText(text)
            animate().alpha(1f).setDuration(260).start()
        }.start()
    }

    private companion object {
        const val SLOW_MS = 6_000L
        const val SWITCH_MAX_MS = 10_000L
        const val MIN_SWITCH_MS = 450L
    }
}
