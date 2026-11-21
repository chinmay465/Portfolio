package com.chinmay.kavach.vpn

import android.net.VpnService
import android.os.ParcelFileDescriptor
import android.system.ErrnoException
import android.system.Os
import android.system.OsConstants
import android.system.StructPollfd
import android.util.Log
import java.io.FileDescriptor
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException

/**
 * Reads DNS queries from the tun interface, answers blocked ones with
 * NXDOMAIN, and forwards the rest over DNS-over-HTTPS. Kavach's own traffic
 * is excluded from the VPN, so the DoH requests can't loop back into it.
 *
 * Privacy: domains are only held in memory long enough to answer the query.
 * Nothing about allowed lookups is stored or logged.
 */
class DnsTunnel(
    private val service: VpnService,
    private val tun: ParcelFileDescriptor,
) {
    private val doh = DohClient()

    private val input = FileInputStream(tun.fileDescriptor)
    private val output = FileOutputStream(tun.fileDescriptor)
    private val forwarders: ExecutorService = Executors.newFixedThreadPool(8)

    // Closing the write end wakes the poll() loop so we can stop cleanly.
    private val wakePipe: Array<FileDescriptor> = Os.pipe()
    private var thread: Thread? = null

    fun start() {
        thread = Thread(::loop, "kavach-dns").also { it.start() }
    }

    fun stop() {
        closeQuietly(wakePipe[1])
        thread?.join(2_000)
        thread = null
        forwarders.shutdownNow()
        closeQuietly(wakePipe[0])
    }

    private fun loop() {
        Blocklist.ensureLoaded(service)

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
                    Os.poll(fds, -1)
                } catch (e: ErrnoException) {
                    if (e.errno == OsConstants.EINTR) continue
                    throw e
                }
                if (wakePoll.revents.toInt() != 0) break
                if ((tunPoll.revents.toInt() and OsConstants.POLLIN) == 0) continue

                val n = input.read(buf)
                if (n <= 0) continue
                handle(buf, n)
            }
        } catch (e: Exception) {
            Log.w(TAG, "DNS loop stopped", e)
        }
    }

    private fun handle(buf: ByteArray, len: Int) {
        val query = Packets.parseDnsQuery(buf, len) ?: return
        val domain = query.domain

        if (domain != null && query.questionEnd > 0 && Blocklist.isBlocked(domain)) {
            AdBlockState.onQuery(domain, wasBlocked = true)
            write(Packets.buildReply(query, Packets.blockedDnsResponse(query)))
            return
        }

        AdBlockState.onQuery(domain, wasBlocked = false)
        try {
            forwarders.execute { forward(query) }
        } catch (_: RejectedExecutionException) {
            // Shutting down.
        }
    }

    private fun forward(query: Packets.DnsQuery) {
        val response = try {
            doh.resolve(query.dnsPayload())
        } catch (_: IOException) {
            // No answer: the app's resolver times out and retries. Deliberately
            // not logged, so the domain never reaches logcat.
            return
        }
        write(Packets.buildReply(query, response))
    }

    private fun write(packet: ByteArray) {
        try {
            synchronized(output) { output.write(packet) }
        } catch (e: IOException) {
            Log.d(TAG, "tun write failed")
        }
    }

    private fun closeQuietly(fd: FileDescriptor) {
        try {
            Os.close(fd)
        } catch (_: ErrnoException) {
        }
    }

    private companion object {
        const val TAG = "KavachDns"
    }
}
