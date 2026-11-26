package com.chinmay.prahari.core

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update

/** In-memory state shared by the services and the UI. Nothing here is persisted. */
object LiveState {
    data class Active(val key: String, val kind: Kind, val pkg: String?, val candidates: List<String>, val since: Long, val background: Boolean)
    data class Lookup(val time: Long, val pkg: String?, val domain: String, val tracker: String?, val background: Boolean)

    val watching = MutableStateFlow(false)
    val gpsWatching = MutableStateFlow(false)
    val precision = MutableStateFlow(false)
    val active = MutableStateFlow<List<Active>>(emptyList())

    val dnsOn = MutableStateFlow(false)
    val dnsError = MutableStateFlow<String?>(null)
    val lookups = MutableStateFlow<List<Lookup>>(emptyList())

    /** Bumped whenever the database gains rows, so open screens can refresh. */
    val revision = MutableStateFlow(0L)

    /** Prahari's own CPU time, to show what watching costs. */
    @Volatile var serviceStartedAt = 0L
    @Volatile var cpuAtServiceStart = 0L

    fun bump() = revision.update { it + 1 }

    fun addLookup(l: Lookup) = lookups.update { (listOf(l) + it).take(300) }
}
