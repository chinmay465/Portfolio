package com.chinmay.kavach.proxy

/**
 * The proxies that passed the on-phone check, fastest first, plus which one
 * new connections use right now. Free proxies die often, so a proxy that
 * fails [maxFails] times in a row is dropped and the next one takes over.
 * Thread-safe: the local proxy reports results from many connection threads.
 */
class UpstreamPool(private val maxFails: Int = 2) {

    class Entry(val proxy: ProxyServer, val latencyMs: Int, val exitIp: String) {
        internal var fails = 0
        val address: String get() = proxy.address
    }

    /** Called (outside the lock) whenever the current proxy or the pool size changes. */
    @Volatile var onChange: (() -> Unit)? = null

    private val entries = ArrayList<Entry>()
    private var index = 0

    fun replace(checked: List<Entry>) {
        synchronized(this) {
            entries.clear()
            entries += checked.distinctBy { it.address }.sortedBy { it.latencyMs }
            index = 0
        }
        onChange?.invoke()
    }

    fun current(): Entry? = synchronized(this) { entries.getOrNull(index) }

    fun size(): Int = synchronized(this) { entries.size }

    fun addresses(): Set<String> = synchronized(this) { entries.mapTo(HashSet()) { it.address } }

    /** Current proxy first, then the ones after it: the order a new connection tries them in. */
    fun attemptOrder(max: Int = 3): List<Entry> = synchronized(this) {
        if (entries.isEmpty()) return emptyList()
        (0 until minOf(max, entries.size)).map { entries[(index + it) % entries.size] }
    }

    fun reportSuccess(entry: Entry) {
        synchronized(this) { entry.fails = 0 }
    }

    /** Returns true when the proxy was dropped from the pool. */
    fun reportFailure(entry: Entry): Boolean {
        val dropped = synchronized(this) {
            val at = entries.indexOf(entry)
            if (at < 0) return false
            entry.fails++
            if (entry.fails < maxFails) return false
            entries.removeAt(at)
            if (at < index) index--
            if (index >= entries.size) index = 0
            true
        }
        if (dropped) onChange?.invoke()
        return dropped
    }

    /** Moves new connections to the next proxy. Returns the new current proxy. */
    fun rotate(): Entry? {
        val next = synchronized(this) {
            if (entries.isEmpty()) return null
            index = (index + 1) % entries.size
            entries[index]
        }
        onChange?.invoke()
        return next
    }

    /** Adds freshly checked proxies after the existing ones (keeps the current proxy). */
    fun addAll(checked: List<Entry>) {
        synchronized(this) {
            val have = entries.mapTo(HashSet()) { it.address }
            entries += checked.filter { have.add(it.address) }.sortedBy { it.latencyMs }
        }
        onChange?.invoke()
    }
}
