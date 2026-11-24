package com.chinmay.kavach.vpn

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update

/**
 * Process-wide state shared between the VPN service and the UI.
 * Everything here lives in memory only and is gone when the app process ends.
 */
object AdBlockState {
    data class Lookup(val domain: String, val blocked: Boolean)

    /** Where proxy mode stands. Addresses here are the free proxies', never the user's lookups. */
    sealed interface Proxy {
        data object Off : Proxy
        /** [total] = 0 while the pool is still being fetched from Setu. */
        data class Connecting(val tested: Int, val total: Int) : Proxy
        data class Active(
            val address: String,
            val exitIp: String,
            val latencyMs: Int,
            val poolSize: Int,
            /** Kavach's loopback proxy port that apps are handed. */
            val localPort: Int,
        ) : Proxy
        data class Unavailable(val reason: Reason) : Proxy
        enum class Reason { AUTH, SETU_UNREACHABLE, NONE_WORKING }
    }

    val running = MutableStateFlow(false)
    val proxy = MutableStateFlow<Proxy>(Proxy.Off)

    /**
     * App connections that reached Kavach's proxy, that got an answer through
     * a free proxy, and that failed on every proxy tried.
     */
    val proxyReceived = MutableStateFlow(0L)
    val proxyOk = MutableStateFlow(0L)
    val proxyFailed = MutableStateFlow(0L)

    fun resetProxyCounters() {
        proxyReceived.value = 0
        proxyOk.value = 0
        proxyFailed.value = 0
    }
    val queries = MutableStateFlow(0L)
    val blocked = MutableStateFlow(0L)
    val recentBlocked = MutableStateFlow<List<String>>(emptyList())
    val blocklistSize = MutableStateFlow(0)
    val ruleCount = MutableStateFlow(0)

    /**
     * Opt-in, off by default and on every app start. While on, every looked-up
     * domain is listed (in memory only) so you can find ad servers. Turning it
     * off wipes the list.
     */
    val liveLookups = MutableStateFlow(false)
    val recentLookups = MutableStateFlow<List<Lookup>>(emptyList())

    private const val RECENT_LIMIT = 50
    private const val LOOKUP_LIMIT = 500

    fun onQuery(domain: String?, wasBlocked: Boolean) {
        queries.update { it + 1 }
        if (domain == null) return
        if (wasBlocked) {
            blocked.update { it + 1 }
            recentBlocked.update { list -> (listOf(domain) + list.filter { it != domain }).take(RECENT_LIMIT) }
        }
        if (liveLookups.value) {
            recentLookups.update { list ->
                (listOf(Lookup(domain, wasBlocked)) + list.filter { it.domain != domain }).take(LOOKUP_LIMIT)
            }
        }
    }

    fun setLiveLookups(on: Boolean) {
        liveLookups.value = on
        if (!on) recentLookups.value = emptyList()
    }

    /** Reflects a block/allow the user just made in the on-screen lists. */
    fun markDomain(domain: String, blocked: Boolean) {
        val covered = { d: String -> DomainSet.ruleMatches(domain, d) }
        if (!blocked) recentBlocked.update { list -> list.filterNot(covered) }
        recentLookups.update { list -> list.map { if (covered(it.domain)) it.copy(blocked = blocked) else it } }
    }

    /** Empties the on-screen lists (counters are kept). */
    fun clearLists() {
        recentBlocked.value = emptyList()
        recentLookups.value = emptyList()
    }

    fun resetSession() {
        queries.value = 0
        blocked.value = 0
        recentBlocked.value = emptyList()
        recentLookups.value = emptyList()
    }
}
