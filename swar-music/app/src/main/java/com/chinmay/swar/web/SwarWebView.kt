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
 * page is hidden, whatever the page's own JavaScript does. Hiding happens when
 * the window becomes invisible, so the window's INVISIBLE state is reported as
 * VISIBLE here. GONE (the view really being removed) still passes through.
 */
class SwarWebView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : WebView(context, attrs) {

    override fun onWindowVisibilityChanged(visibility: Int) {
        super.onWindowVisibilityChanged(if (visibility == View.GONE) visibility else View.VISIBLE)
    }
}
