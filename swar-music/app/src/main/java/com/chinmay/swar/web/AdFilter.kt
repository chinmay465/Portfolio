package com.chinmay.swar.web

/**
 * Network-level ad blocking for requests the WebView makes. The page script
 * (assets/swar.js) removes ads from the API data; this catches the ad
 * servers, ad beacons and ad pixels that would still load.
 */
object AdFilter {

    private val BLOCKED_DOMAINS = listOf(
        "doubleclick.net",
        "googlesyndication.com",
        "googleadservices.com",
        "googletagservices.com",
        "googletagmanager.com",
        "imasdk.googleapis.com",
        "adservice.google.com",
    )

    private val YOUTUBE_DOMAINS = listOf("youtube.com", "youtube-nocookie.com")

    /** Ad endpoints on YouTube's own hosts, where blocking the whole host would break playback. */
    private val BLOCKED_YOUTUBE_PATHS = listOf(
        "/pagead/",
        "/api/stats/ads",
        "/ptracking",
        "/get_midroll_info",
        "/pcs/activeview",
        "/ad_data_204",
        "/youtubei/v1/player/ad_break",
    )

    fun shouldBlock(url: String): Boolean {
        val scheme = Urls.scheme(url)
        if (scheme != "https" && scheme != "http") return false
        val host = Urls.host(url)
        if (host.isEmpty()) return false
        if (BLOCKED_DOMAINS.any { Urls.isDomainOrSub(host, it) }) return true
        if (YOUTUBE_DOMAINS.any { Urls.isDomainOrSub(host, it) }) {
            val path = Urls.path(url)
            return BLOCKED_YOUTUBE_PATHS.any { path.startsWith(it) }
        }
        return false
    }
}
