package com.chinmay.swar.web

import android.content.Context
import android.util.AttributeSet
import android.view.View
import android.webkit.WebView

/**
 * A WebView that keeps telling the page it's on screen while the app is in the
 * background or the screen is off.
 *
 * Chromium pauses a playing *video* (unlike audio-only playback) as soon as the
 * page is hidden, whatever the page's own JavaScript does. A stopped activity
 * (screen off, another app opened) reports its window as GONE, so every window
 * visibility change is passed on as VISIBLE. The view itself stays attached
 * until MainActivity destroys the WebView.
 */
class SwarWebView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : WebView(context, attrs) {

    override fun onWindowVisibilityChanged(visibility: Int) {
        super.onWindowVisibilityChanged(View.VISIBLE)
    }
}
