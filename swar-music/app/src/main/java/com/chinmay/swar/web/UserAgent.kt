package com.chinmay.swar.web

/**
 * WebView's default user agent marks it as an embedded browser ("; wv" and
 * "Version/4.0"), and Google's sign-in page refuses many such browsers. This
 * turns it into the same reduced user agent Chrome for Android sends, which
 * also hides the phone model.
 */
object UserAgent {

    private val PLATFORM = Regex("""\(Linux; Android [^)]*\)""")
    private val VERSION_TOKEN = Regex("""\s*Version/\d+(\.\d+)*""")
    private val CHROME_VERSION = Regex("""Chrome/(\d+)[\d.]*""")

    fun chromeLike(webViewUserAgent: String): String = webViewUserAgent
        .replace(PLATFORM, "(Linux; Android 10; K)")
        .replace(VERSION_TOKEN, "")
        .replace(CHROME_VERSION) { "Chrome/${it.groupValues[1]}.0.0.0" }
        .replace(Regex("""\s{2,}"""), " ")
        .trim()
}
