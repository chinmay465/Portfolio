package com.chinmay.kavach.vpn

/**
 * How the downloaded list, your own blocks and your allows combine.
 *
 * 1. A domain you blocked yourself is always blocked (covers subdomains).
 * 2. Otherwise a domain on the blocklist is blocked unless you allowed it.
 *
 * Blocking a domain removes the same domain from your allows. Allowing a
 * domain removes any block of yours that would still cover it.
 */
object DomainRules {

    fun isBlocked(domain: String, list: DomainSet, custom: DomainSet, allowed: DomainSet): Boolean =
        custom.matches(domain) || (list.matches(domain) && !allowed.matches(domain))

    /** New (custom, allowed) sets after the user blocks [domain]. */
    fun block(domain: String, custom: Set<String>, allowed: Set<String>): Pair<Set<String>, Set<String>> =
        (custom + domain) to (allowed - domain)

    /** New (custom, allowed) sets after the user allows [domain]. */
    fun allow(domain: String, custom: Set<String>, allowed: Set<String>): Pair<Set<String>, Set<String>> =
        custom.filterNot { covers(it, domain) }.toSet() to (allowed + domain)

    private fun covers(rule: String, domain: String) = domain == rule || domain.endsWith(".$rule")

    private val VALID = Regex("^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$")

    /**
     * Turns what the user typed or pasted ("https://Ads.Example.com/x?y",
     * "*.example.com", "example.com.") into a bare domain, or null if it
     * isn't a valid domain name.
     */
    fun normalize(input: String): String? {
        var s = input.trim().lowercase()
        s = s.substringAfter("://")
        s = s.substringBefore('/').substringBefore('?').substringBefore('#')
        s = s.substringAfterLast('@').substringBefore(':')
        s = s.removePrefix("*.").removePrefix(".").trimEnd('.')
        return if (VALID.matches(s)) s else null
    }
}
