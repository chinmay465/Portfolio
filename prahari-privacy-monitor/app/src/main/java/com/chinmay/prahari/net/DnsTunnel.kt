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
import com.chinmay.prahari.core.LiveState
import com.chinmay.prahari.data.Db
import com.chinmay.prahari.watch.UsageTracker
import java.io.FileDescriptor
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.net.InetAddress
import java.net.InetSocketAddress
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException

/**
 * Reads DNS queries from the tun interface, notes which app asked for which
 * domain, and answers them over DNS-over-HTTPS. The thread sleeps in poll()
 * until a query arrives, and rows are written to the database in batches.
 */
class DnsTunnel(
    private val service: VpnService,
    private val tun: ParcelFileDescriptor,
) {
    private val doh = DohClient()
    private val cm = service.getSystemService(ConnectivityManager::class.java)
    private val power = service.getSystemService(PowerManager::class.java)
    private val usage = UsageTracker(service)
    private val db = Db.get(service)

    private val input = FileInputStream(tun.fileDescriptor)
    private val output = FileOutputStream(tun.fileDescriptor)
    private val forwarders: ExecutorService = Executors.newFixedThreadPool(6)
    private val wakePipe: Array<FileDescriptor> = Os.pipe()
    private var thread: Thread? = null

    private val pending = ArrayList<Db.DnsRow>()
    private var lastFlush = System.currentTimeMillis()
    private val uidNames = HashMap<Int, String>()

    fun start() {
        thread = Thread(::loop, "prahari-dns").also { it.start() }
    }

    fun stop() {
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
                if (n > 0) handle(buf, n)
            }
        } catch (_: Exception) {
        }
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
        } catch (_: Exception) {
        }
    }

    private fun forward(query: Packets.DnsQuery) {
        val response = try {
            doh.resolve(query.dnsPayload())
        } catch (_: IOException) {
            return
        }
        try {
            synchronized(output) { output.write(Packets.buildReply(query, response)) }
        } catch (_: IOException) {
        }
    }

    private fun closeQuietly(fd: FileDescriptor) {
        try {
            Os.close(fd)
        } catch (_: ErrnoException) {
        }
    }

    private companion object {
        const val BATCH = 50
        const val FLUSH_MS = 30_000L
    }
}
