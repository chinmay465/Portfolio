package com.chinmay.swar.web

/** Minimal URL splitting that never throws (java.net.URI rejects many real-world URLs). */
internal object Urls {
    fun scheme(url: String): String = url.substringBefore(':', "").lowercase()

    fun host(url: String): String {
        val afterScheme = url.substringAfter("://", "")
        val authority = afterScheme.substringBefore('/').substringBefore('?').substringBefore('#')
        return authority.substringAfterLast('@').substringBefore(':').lowercase()
    }

    fun path(url: String): String {
        val afterScheme = url.substringAfter("://", "")
        val slash = afterScheme.indexOf('/')
        if (slash < 0) return "/"
        return afterScheme.substring(slash).substringBefore('?').substringBefore('#')
    }

    fun isDomainOrSub(host: String, domain: String): Boolean =
        host == domain || host.endsWith(".$domain")
}
