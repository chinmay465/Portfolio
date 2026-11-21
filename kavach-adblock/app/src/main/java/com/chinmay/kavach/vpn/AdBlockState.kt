package com.chinmay.kavach.vpn

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update

/** Process-wide state shared between the VPN service and the UI. */
object AdBlockState {
    val running = MutableStateFlow(false)
    val queries = MutableStateFlow(0L)
    val blocked = MutableStateFlow(0L)
    val recentBlocked = MutableStateFlow<List<String>>(emptyList())
    val blocklistSize = MutableStateFlow(0)
    val allowlistSize = MutableStateFlow(0)

    private const val RECENT_LIMIT = 50

    fun onQuery(domain: String?, wasBlocked: Boolean) {
        queries.update { it + 1 }
        if (wasBlocked && domain != null) {
            blocked.update { it + 1 }
            recentBlocked.update { list ->
                (listOf(domain) + list.filter { it != domain }).take(RECENT_LIMIT)
            }
        }
    }

    fun resetSession() {
        queries.value = 0
        blocked.value = 0
        recentBlocked.value = emptyList()
    }
}
