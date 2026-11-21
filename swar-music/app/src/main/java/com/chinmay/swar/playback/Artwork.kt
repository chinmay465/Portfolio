package com.chinmay.swar.playback

import com.chinmay.swar.web.Urls

/** Album art is only fetched from Google's image CDNs, never from arbitrary hosts. */
object Artwork {
    private val TRUSTED = listOf("ytimg.com", "ggpht.com", "googleusercontent.com")

    fun isTrustedUrl(url: String): Boolean =
        Urls.scheme(url) == "https" && TRUSTED.any { Urls.isDomainOrSub(Urls.host(url), it) }
}
