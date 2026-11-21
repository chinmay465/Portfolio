package com.chinmay.kavach.vpn

/**
 * A set of domains where an entry also covers its subdomains:
 * if "doubleclick.net" is in the set, "ad.g.doubleclick.net" matches too.
 *
 * Entries may also be wildcard patterns, where `*` stands for any run of
 * letters, digits or hyphens inside one label:
 * "rr*---sn-ccoa-*.googlevideo.com" matches "rr2---sn-ccoa-cagz.googlevideo.com".
 * A pattern matches the whole host name only, not its subdomains.
 */
class DomainSet(entries: Set<String>) {

    private val domains: Set<String> = entries.filterTo(HashSet()) { '*' !in it }
    private val patterns: List<Regex> = entries.filter { '*' in it }.map(::patternToRegex)

    val size: Int get() = domains.size + patterns.size

    fun matches(host: String): Boolean {
        if (host.isEmpty()) return false
        if (patterns.isNotEmpty() && patterns.any { it.matches(host) }) return true
        if (domains.isEmpty()) return false
        var d = host
        while (true) {
            if (d in domains) return true
            val dot = d.indexOf('.')
            if (dot < 0) return false
            d = d.substring(dot + 1)
            // Never match on a bare TLD like "com".
            if (d.indexOf('.') < 0) return false
        }
    }

    companion object {
        val EMPTY = DomainSet(emptySet())

        /** `*` = any letters, digits or hyphens within a single label. */
        fun patternToRegex(pattern: String): Regex =
            Regex(pattern.split('*').joinToString("[a-z0-9-]*") { Regex.escape(it) })

        // Wildcards only in the leading labels; the last two labels must be
        // literal, so no pattern can cover a whole TLD or everything.
        private val SAFE_PATTERN =
            Regex("^([a-z0-9*]([a-z0-9*-]{0,61}[a-z0-9*])?\\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.[a-z][a-z0-9-]{0,61}[a-z0-9]$")

        fun isSafePattern(p: String): Boolean =
            p.length in 4..253 && SAFE_PATTERN.matches(p) && p.replace("*", "").length >= 4

        /** Whether a single rule (domain or pattern) covers [host]. */
        fun ruleMatches(rule: String, host: String): Boolean =
            if ('*' in rule) patternToRegex(rule).matches(host)
            else host == rule || host.endsWith(".$rule")

        private val WHITESPACE = Regex("\\s+")
        private val IGNORED = setOf(
            "localhost", "localhost.localdomain", "local", "broadcasthost",
            "ip6-localhost", "ip6-loopback", "ip6-localnet", "ip6-mcastprefix",
            "ip6-allnodes", "ip6-allrouters", "ip6-allhosts", "0.0.0.0",
        )
        private val IP_LIKE = Regex("^[0-9.:]+$")

        /**
         * Accepts hosts-file lines ("0.0.0.0 ads.example.com") and plain
         * domain-per-line lists. Comments start with '#'.
         */
        fun parseInto(lines: Sequence<String>, into: MutableSet<String>) {
            for (raw in lines) {
                val line = raw.substringBefore('#').trim()
                if (line.isEmpty()) continue
                val parts = line.split(WHITESPACE)
                val hosts = if (parts.size >= 2 && IP_LIKE.matches(parts[0])) {
                    parts.subList(1, parts.size)
                } else {
                    parts.subList(0, 1)
                }
                for (h in hosts) {
                    val host = h.lowercase().trimEnd('.')
                    if (host in IGNORED || '.' !in host || IP_LIKE.matches(host)) continue
                    if ('*' in host && !isSafePattern(host)) continue
                    into.add(host)
                }
            }
        }
    }
}
