package com.chinmay.prahari.net

import android.net.ConnectivityManager
import android.net.VpnService
import android.os.ParcelFileDescriptor
import android.os.PowerManager
import android.os.Process
import android.system.ErrnoException
import android.system.Os
import android.system.OsConstants
import android.system.StructPollfd
import android.util.Log
import com.chinmay.prahari.core.LiveState
import com.chinmay.prahari.data.Db
import com.chinmay.prahari.watch.UsageTracker
import java.io.FileDescriptor
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.util.concurrent.ExecutorService
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
import java.util.concurrent.RejectedExecutionException

/**
 * Reads DNS queries from the tun interface, notes which app asked for which
 * domain, and answers them over DNS-over-HTTPS. The thread sleeps in poll()
 * until a query arrives, and rows are written to the database in batches.
 */
class DnsTunnel(
    private val service: VpnService,
    private val tun: ParcelFileDescriptor,
    /** Called if the tunnel stops on its own, so the VPN is torn down instead of swallowing DNS. */
    private val onDied: () -> Unit,
) {
    // Short timeouts: a slow DoH server must not stall every app's lookups.
    private val doh = DohClient(timeoutMs = 2_000)
    @Volatile private var dohDownUntil = 0L
    private val stats = java.util.concurrent.atomic.AtomicIntegerArray(4) // queries, doh, network, failed
    private val cm = service.getSystemService(ConnectivityManager::class.java)
    private val power = service.getSystemService(PowerManager::class.java)
    private val usage = UsageTracker(service)
    private val db = Db.get(service)

    private val input = FileInputStream(tun.fileDescriptor)
    private val output = FileOutputStream(tun.fileDescriptor)
    // Bounded: a flood of lookups is dropped (apps retry) instead of growing memory.
    private val forwarders: ExecutorService = ThreadPoolExecutor(
        6, 6, 30, TimeUnit.SECONDS, ArrayBlockingQueue(256), ThreadPoolExecutor.DiscardPolicy(),
    ).apply { allowCoreThreadTimeOut(true) }
    @Volatile private var stopping = false
    private val wakePipe: Array<FileDescriptor> = Os.pipe()
    private var thread: Thread? = null

    private val pending = ArrayList<Db.DnsRow>()
    private var lastFlush = System.currentTimeMillis()
    private val uidNames = HashMap<Int, String>()

    fun start() {
        Log.i(TAG, "tunnel up")
        thread = Thread(::loop, "prahari-dns").also { it.start() }
    }

    fun stop() {
        stopping = true
        closeQuietly(wakePipe[1])
        thread?.join(2_000)
        thread = null
        forwarders.shutdownNow()
        closeQuietly(wakePipe[0])
        flush(force = true)
    }

    private fun loop() {
        val buf = ByteArray(32_767)
        val tunPoll = StructPollfd().apply {
            fd = tun.fileDescriptor
            events = OsConstants.POLLIN.toShort()
        }
        val wakePoll = StructPollfd().apply {
            fd = wakePipe[0]
            events = (OsConstants.POLLHUP or OsConstants.POLLERR).toShort()
        }
        val fds = arrayOf(tunPoll, wakePoll)
        try {
            while (true) {
                try {
                    // Sleep until a query arrives; only wake on a timer when a batch is waiting to be saved.
                    val waiting = synchronized(pending) { pending.isNotEmpty() }
                    Os.poll(fds, if (waiting) FLUSH_MS.toInt() else -1)
                } catch (e: ErrnoException) {
                    if (e.errno == OsConstants.EINTR) continue
                    throw e
                }
                if (wakePoll.revents.toInt() != 0) break
                if ((tunPoll.revents.toInt() and OsConstants.POLLIN) == 0) {
                    flush(force = false)
                    continue
                }
                val n = input.read(buf)
                if (n > 0) {
                    try {
                        handle(buf, n)
                    } catch (_: Exception) {
                        // One bad packet must not stop DNS for the whole phone.
                    }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "tunnel loop ended: ${e.javaClass.simpleName}")
        }
        if (!stopping) onDied()
    }

    private fun handle(buf: ByteArray, len: Int) {
        val query = Packets.parseDnsQuery(buf, len) ?: return
        val domain = query.domain
        if (domain != null) record(query, domain)
        try {
            forwarders.execute { forward(query) }
        } catch (_: RejectedExecutionException) {
        }
    }

    private fun record(q: Packets.DnsQuery, domain: String) {
        val now = System.currentTimeMillis()
        val pkg = ownerOf(q)
        val fg = usage.now(maxAgeMs = 2_000).foreground
        val background = !power.isInteractive || (pkg != null && pkg != fg)
        val tracker = TrackerDomains.label(domain)
        LiveState.addLookup(LiveState.Lookup(now, pkg, domain, tracker, background))
        synchronized(pending) { pending += Db.DnsRow(pkg ?: Db.UNKNOWN_PKG, domain, now, background) }
        flush(force = false)
    }

    /** Android tells the active VPN which app owns a socket (Android 10+). */
    private fun ownerOf(q: Packets.DnsQuery): String? {
        val p = q.packet
        val ihl = q.ipHeaderLen
        return try {
            val src = InetSocketAddress(InetAddress.getByAddress(p.copyOfRange(12, 16)), Packets.u16(p, ihl))
            val dst = InetSocketAddress(InetAddress.getByAddress(p.copyOfRange(16, 20)), Packets.u16(p, ihl + 2))
            val uid = cm.getConnectionOwnerUid(OsConstants.IPPROTO_UDP, src, dst)
            if (uid == Process.INVALID_UID || uid < 0) null else nameOf(uid)
        } catch (_: Exception) {
            null
        }
    }

    private fun nameOf(uid: Int): String = uidNames.getOrPut(uid) {
        service.packageManager.getPackagesForUid(uid)?.firstOrNull()
            ?: when (uid) {
                0 -> "root"
                1000 -> "android"
                else -> "uid:$uid"
            }
    }

    private fun flush(force: Boolean) {
        val now = System.currentTimeMillis()
        val batch: List<Db.DnsRow>
        synchronized(pending) {
            if (pending.isEmpty()) return
            if (!force && pending.size < BATCH && now - lastFlush < FLUSH_MS) return
            batch = ArrayList(pending)
            pending.clear()
            lastFlush = now
        }
        try {
            db.addDns(batch)
            LiveState.bump()
        } catch (e: Exception) {
            Log.w(TAG, "couldn't save ${batch.size} lookups: ${e.javaClass.simpleName}")
        }
    }

    private fun forward(query: Packets.DnsQuery) {
        val payload = query.dnsPayload()
        val n = stats.incrementAndGet(0)
        // DoH first. If it fails (some networks block it), use the network's own resolver,
        // the one Android would use without Prahari, and skip DoH for a few minutes so
        // lookups stay fast. Watching must never cost the phone its DNS.
        val now = System.currentTimeMillis()
        var response: ByteArray? = null
        if (now >= dohDownUntil) {
            response = try {
                doh.resolve(payload).also { stats.incrementAndGet(1) }
            } catch (_: IOException) {
                dohDownUntil = now + DOH_RETRY_MS
                Log.w(TAG, "DoH unreachable, using the network's DNS for ${DOH_RETRY_MS / 60_000} min")
                null
            }
        }
        if (response == null) {
            response = try {
                plainDns(payload).also { stats.incrementAndGet(2) }
            } catch (_: IOException) {
                null
            }
        }
        if (n % 25 == 1) Log.i(TAG, "lookups=${stats[0]} doh=${stats[1]} network=${stats[2]} failed=${stats[3]}")
        if (response == null) {
            stats.incrementAndGet(3)
            return
        }
        try {
            synchronized(output) { output.write(Packets.buildReply(query, response)) }
        } catch (_: IOException) {
        }
    }

    private fun plainDns(payload: ByteArray): ByteArray {
        // Prahari is excluded from its own VPN, so this is the underlying network.
        val servers = cm.getLinkProperties(cm.activeNetwork)?.dnsServers.orEmpty()
        var last: IOException = IOException("No network DNS server")
        for (server in servers.take(2)) {
            try {
                DatagramSocket().use { socket ->
                    service.protect(socket)
                    socket.soTimeout = 3_000
                    socket.send(DatagramPacket(payload, payload.size, server, 53))
                    val buf = ByteArray(4_096)
                    val reply = DatagramPacket(buf, buf.size)
                    socket.receive(reply)
                    // Only accept the answer to this query (same transaction id).
                    if (reply.length < 12 || buf[0] != payload[0] || buf[1] != payload[1]) throw IOException("Mismatched DNS reply")
                    return buf.copyOf(reply.length)
                }
            } catch (e: IOException) {
                last = e
            }
        }
        throw last
    }

    private fun closeQuietly(fd: FileDescriptor) {
        try {
            Os.close(fd)
        } catch (_: ErrnoException) {
        }
    }

    private companion object {
        const val TAG = "PrahariDns"
        const val DOH_RETRY_MS = 5 * 60_000L
        const val BATCH = 50
        const val FLUSH_MS = 30_000L
    }
}
