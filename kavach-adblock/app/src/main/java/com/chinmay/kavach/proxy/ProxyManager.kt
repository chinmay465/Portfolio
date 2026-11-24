package com.chinmay.kavach.proxy

import android.content.Context
import android.util.Log
import com.chinmay.kavach.vpn.AdBlockState
import com.chinmay.kavach.vpn.AdBlockState.Proxy
import com.chinmay.kavach.vpn.Blocklist
import java.io.IOException
import java.util.concurrent.Callable
import java.util.concurrent.ExecutorCompletionService
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.TimeUnit

/**
 * Runs proxy mode: fetches Setu's pool, tests the proxies from the phone,
 * starts the [LocalProxy] and tells the VPN when to point apps at it.
 * Every 60 s it re-tests the current proxy, rotates on schedule and tops the
 * pool up from Setu when it runs low. With no working proxy, apps go direct
 * (still ad-blocked by DNS) and it keeps retrying.
 *
 * All control work runs on one thread, so the steps never overlap.
 */
class ProxyManager(
    private val ctx: Context,
    /**
     * Switches the VPN: a port = capture all traffic into the full tunnel and
     * send it to Kavach's proxy there; null = DNS-only mode, apps go direct.
     * Returns false if the full tunnel couldn't start.
     */
    private val onRoute: (Int?) -> Boolean,
) {
    private val settings = ProxySettings(ctx)
    private val pool = UpstreamPool()
    private val control = Executors.newSingleThreadScheduledExecutor { Thread(it, "kavach-proxy-ctl") }
    private val checkers = Executors.newFixedThreadPool(CHECK_THREADS)
    @Volatile private var local: LocalProxy? = null
    @Volatile private var routedPort: Int? = null
    @Volatile private var stopped = false
    private var lastRotateAt = 0L

    /** The port apps are currently sent to, or null when they go direct. */
    val currentPort: Int? get() = routedPort

    fun start() {
        AdBlockState.resetProxyCounters()
        pool.onChange = {
            publishActive()
            // Every proxy failed: send apps direct, then fetch a fresh set.
            if (pool.size() == 0) onControl { goDirect(Proxy.Reason.NONE_WORKING); bringUp() }
        }
        onControl(::bringUp)
        try {
            // A task that throws would cancel the schedule, so tick() never throws.
            control.scheduleWithFixedDelay({ runCatching { tick() } }, TICK_S, TICK_S, TimeUnit.SECONDS)
        } catch (_: RejectedExecutionException) {
        }
    }

    fun stop() {
        stopped = true
        pool.onChange = null
        control.shutdownNow()
        checkers.shutdownNow()
        local?.stop()
        local = null
        routedPort = null
        AdBlockState.proxy.value = Proxy.Off
    }

    /** "Switch proxy": new connections use the next proxy straight away. */
    fun next() {
        onControl {
            if (pool.size() <= 1) refill(force = true)
            pool.rotate()
            lastRotateAt = System.currentTimeMillis()
        }
    }

    private fun onControl(task: () -> Unit) {
        try {
            control.execute { if (!stopped) task() }
        } catch (_: RejectedExecutionException) {
        }
    }

    private fun scheduleBringUp(delayS: Long) {
        try {
            control.schedule(Runnable { if (!stopped && pool.size() == 0) bringUp() }, delayS, TimeUnit.SECONDS)
        } catch (_: RejectedExecutionException) {
        }
    }

    private fun bringUp() {
        if (pool.size() > 0) return
        // The proxy blocks by host name, so the blocklist must be ready first.
        Blocklist.ensureLoaded(ctx)
        AdBlockState.proxy.value = Proxy.Connecting(0, 0)
        val good = try {
            testFresh(exclude = emptySet())
        } catch (_: SetuClient.AuthException) {
            goDirect(Proxy.Reason.AUTH)
            return // a wrong token won't fix itself; wait for the user to change it
        } catch (_: IOException) {
            goDirect(Proxy.Reason.SETU_UNREACHABLE)
            scheduleBringUp(RETRY_SOON_S)
            return
        } catch (_: IllegalArgumentException) {
            goDirect(Proxy.Reason.SETU_UNREACHABLE) // bad Setu URL
            return
        }
        if (stopped) return
        if (good.isEmpty()) {
            goDirect(Proxy.Reason.NONE_WORKING)
            scheduleBringUp(RETRY_LATER_S)
            return
        }
        pool.replace(good)
        lastRotateAt = System.currentTimeMillis()
        routeThroughProxy()
    }

    private fun routeThroughProxy() {
        val proxy = local ?: try {
            LocalProxy(pool).also { it.start(); local = it }
        } catch (_: IOException) {
            goDirect(Proxy.Reason.NONE_WORKING)
            return
        }
        if (routedPort != proxy.port) {
            if (!onRoute(proxy.port)) {
                AdBlockState.proxy.value = Proxy.Unavailable(Proxy.Reason.ENGINE)
                return
            }
            routedPort = proxy.port
            Log.i(TAG, "Proxy mode routing all traffic, ${pool.size()} proxies ready, local proxy on ${proxy.port}")
            if (settings.engineLog) {
                // Debug aid for the emulator test: the path Kavach's Test button checks.
                Log.i(TAG, "Self-test: ${ProxyChecker.selfTest(proxy.port)}")
                val port = proxy.port
                Thread {
                    repeat(10) { i ->
                        val ok = runCatching {
                            java.net.Socket().use {
                                it.connect(java.net.InetSocketAddress(java.net.InetAddress.getLoopbackAddress(), port), 1_000)
                            }
                        }
                        Log.i(TAG, "Listener probe $i: ${ok.exceptionOrNull()?.message ?: "ok"} ${local?.debugState()}")
                        Thread.sleep(2_000)
                    }
                }.start()
            }
        }
        publishActive()
    }

    private fun goDirect(reason: Proxy.Reason) {
        if (stopped) return
        if (routedPort != null) {
            routedPort = null
            onRoute(null)
        }
        AdBlockState.proxy.value = Proxy.Unavailable(reason)
    }

    private fun publishActive() {
        if (stopped) return
        val cur = pool.current() ?: return
        val port = local?.port ?: return
        AdBlockState.proxy.value = Proxy.Active(cur.address, cur.exitIp, cur.latencyMs, pool.size(), port)
    }

    private fun tick() {
        if (stopped || pool.size() == 0) return
        // 1. Is the current proxy still working from here?
        pool.current()?.let { cur ->
            if (ProxyChecker.reachesGoogle(cur.proxy)) pool.reportSuccess(cur) else pool.reportFailure(cur)
        }
        // 2. Scheduled rotation.
        val minutes = settings.rotateMinutes
        val now = System.currentTimeMillis()
        if (minutes > 0 && pool.size() > 1 && now - lastRotateAt >= minutes * 60_000L) {
            pool.rotate()
            lastRotateAt = now
        }
        // 3. Top up before the pool runs dry.
        if (pool.size() in 1 until MIN_POOL) refill(force = false)
    }

    private fun refill(force: Boolean) {
        if (!force && pool.size() >= MIN_POOL) return
        val fresh = try {
            testFresh(exclude = pool.addresses())
        } catch (_: IOException) {
            return
        } catch (_: IllegalArgumentException) {
            return
        }
        if (fresh.isNotEmpty()) pool.addAll(fresh)
    }

    /** Fetches Setu's pool and tests candidates in parallel until [TARGET_GOOD] pass. */
    private fun testFresh(exclude: Set<String>): List<UpstreamPool.Entry> {
        val own = SetuClient.parseList(settings.customProxies)
        val source = own.ifEmpty { SetuClient(settings.setuUrl, settings.token).fetchPool() }
        val candidates = source
            .filter { it.address !in exclude }
            .take(MAX_CANDIDATES)
        if (candidates.isEmpty()) return emptyList()
        val connecting = pool.size() == 0
        if (connecting) AdBlockState.proxy.value = Proxy.Connecting(0, candidates.size)

        val done = ExecutorCompletionService<UpstreamPool.Entry?>(checkers)
        val futures = ArrayList<Future<UpstreamPool.Entry?>>()
        try {
            candidates.forEach { c ->
                val task = Callable<UpstreamPool.Entry?> {
                    ProxyChecker.check(c)?.let { UpstreamPool.Entry(c, it.latencyMs, it.exitIp) }
                }
                futures.add(done.submit(task))
            }
        } catch (_: RejectedExecutionException) {
            return emptyList()
        }
        val good = ArrayList<UpstreamPool.Entry>()
        try {
            for (tested in 1..futures.size) {
                val result = done.poll(CHECK_WAIT_S, TimeUnit.SECONDS) ?: break
                runCatching { result.get() }.getOrNull()?.let { good += it }
                if (connecting && !stopped) AdBlockState.proxy.value = Proxy.Connecting(tested, candidates.size)
                if (good.size >= TARGET_GOOD) break
            }
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
        } finally {
            futures.forEach { it.cancel(true) }
        }
        return good
    }

    private companion object {
        const val TAG = "KavachProxy"
        const val CHECK_THREADS = 12
        const val MAX_CANDIDATES = 40
        const val TARGET_GOOD = 8
        const val MIN_POOL = 3
        const val CHECK_WAIT_S = 10L
        const val TICK_S = 60L
        const val RETRY_SOON_S = 120L
        const val RETRY_LATER_S = 300L
    }
}
