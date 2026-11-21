package com.chinmay.swar.web

/** Decides where a link the page navigates to should open. */
object NavPolicy {

    enum class Action { IN_APP, EXTERNAL, BLOCK }

    /** YouTube Music itself plus the hosts the Google sign-in flow bounces through. */
    private val IN_APP_DOMAINS = listOf("youtube.com", "google.com", "gstatic.com", "googleusercontent.com")

    fun decide(url: String): Action = when (Urls.scheme(url)) {
        "https", "http" -> {
            val host = Urls.host(url)
            when {
                IN_APP_DOMAINS.any { Urls.isDomainOrSub(host, it) } -> Action.IN_APP
                // Sign-in sets cookies on the country domain too (accounts.google.co.in).
                host.startsWith("accounts.google.") || host.startsWith("www.google.") -> Action.IN_APP
                else -> Action.EXTERNAL
            }
        }
        "mailto", "tel" -> Action.EXTERNAL
        // intent://, vnd.youtube:, market: … are "open the YouTube app" links. Stay here.
        else -> Action.BLOCK
    }
}
