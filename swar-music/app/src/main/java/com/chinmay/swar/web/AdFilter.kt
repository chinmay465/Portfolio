package com.chinmay.swar.web

/**
 * Network-level blocking for requests the WebView makes: ad servers, ad
 * beacons, and analytics/telemetry pings. The page script (assets/swar.js)
 * removes ads from the API data; this catches whatever would still load.
 *
 * Kept on purpose: /api/stats/playback and /api/stats/watchtime. They write
 * the song to your YouTube Music history, which is what your recommendations
 * and "Listen again" are built from. To stop that too, pause YouTube History
 * in your Google account (myactivity.google.com), which the server honours.
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
        // Analytics and app telemetry (never needed to play music)
        "google-analytics.com",
        "app-measurement.com",
        "firebaselogging-pa.googleapis.com",
        "clienttracing-pa.googleapis.com",
    )

    /** Google's shared logging endpoint ("Clearcut"), used by its web apps for usage telemetry. */
    private val BLOCKED_GOOGLE_PATHS = mapOf(
        "play.google.com" to listOf("/log"),
        "www.google.com" to listOf("/log", "/gen_204"),
    )

    private val YOUTUBE_DOMAINS = listOf("youtube.com", "youtube-nocookie.com")

    /**
     * Ad and telemetry endpoints on YouTube's own hosts, where blocking the
     * whole host would break playback.
     */
    private val BLOCKED_YOUTUBE_PATHS = listOf(
        // Ads
        "/pagead/",
        "/api/stats/ads",
        "/api/stats/atr",
        "/ptracking",
        "/get_midroll_info",
        "/pcs/activeview",
        "/ad_data_204",
        "/youtubei/v1/player/ad_break",
        // Telemetry: client event logs, quality-of-experience reports,
        // page-timing beacons, JS error reports
        "/youtubei/v1/log_event",
        "/api/stats/qoe",
        "/api/stats/delayplay",
        "/csi_204",
        "/gen_204",
        "/error_204",
    )

    fun shouldBlock(url: String): Boolean {
        val scheme = Urls.scheme(url)
        if (scheme != "https" && scheme != "http") return false
        val host = Urls.host(url)
        if (host.isEmpty()) return false
        if (BLOCKED_DOMAINS.any { Urls.isDomainOrSub(host, it) }) return true
        BLOCKED_GOOGLE_PATHS[host]?.let { paths ->
            val path = Urls.path(url)
            if (paths.any { path == it || path.startsWith("$it/") }) return true
        }
        if (YOUTUBE_DOMAINS.any { Urls.isDomainOrSub(host, it) }) {
            val path = Urls.path(url)
            return BLOCKED_YOUTUBE_PATHS.any { path.startsWith(it) }
        }
        return false
    }
}
