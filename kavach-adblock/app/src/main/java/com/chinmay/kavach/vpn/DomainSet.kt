package com.chinmay.kavach.vpn

/**
 * A set of domains where an entry also covers its subdomains:
 * if "doubleclick.net" is in the set, "ad.g.doubleclick.net" matches too.
 */
class DomainSet(private val domains: Set<String>) {

    val size: Int get() = domains.size

    fun matches(host: String): Boolean {
        if (domains.isEmpty() || host.isEmpty()) return false
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
                    into.add(host)
                }
            }
        }
    }
}
