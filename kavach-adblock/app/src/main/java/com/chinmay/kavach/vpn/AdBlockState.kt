package com.chinmay.kavach.vpn

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update

/**
 * Process-wide state shared between the VPN service and the UI.
 * Everything here lives in memory only and is gone when the app process ends.
 */
object AdBlockState {
    data class Lookup(val domain: String, val blocked: Boolean)

    val running = MutableStateFlow(false)
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
