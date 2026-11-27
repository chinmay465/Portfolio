package com.chinmay.prahari.net

/**
 * Minimal IPv4 / UDP / DNS helpers. We only ever see DNS queries in the tunnel
 * (the VPN routes nothing but the virtual DNS server's address), so this is
 * all the packet handling the app needs. No Android dependencies, so it is
 * unit-testable on the JVM.
 */
object Packets {

    const val PROTO_UDP = 17
    const val DNS_PORT = 53

    /** A DNS query pulled out of a raw IPv4 packet from the tunnel. */
    class DnsQuery(
        /** The full raw IPv4 packet (a private copy). */
        val packet: ByteArray,
        /** IPv4 header length in bytes. */
        val ipHeaderLen: Int,
        /** Offset of the DNS message inside [packet]. */
        val dnsOffset: Int,
        /** Length of the DNS message. */
        val dnsLength: Int,
        /** Lower-cased query name, or null if the question could not be parsed. */
        val domain: String?,
        /** End of the question section, relative to [dnsOffset]. */
        val questionEnd: Int,
    ) {
        fun dnsPayload(): ByteArray = packet.copyOfRange(dnsOffset, dnsOffset + dnsLength)
    }

    /**
     * Returns the DNS query carried by [buf] (first [len] bytes), or null if the
     * packet is not an IPv4/UDP datagram to port 53.
     */
    fun parseDnsQuery(buf: ByteArray, len: Int): DnsQuery? {
        if (len < 20) return null
        val version = (buf[0].toInt() ushr 4) and 0xF
        if (version != 4) return null
        val ihl = (buf[0].toInt() and 0xF) * 4
        if (ihl < 20 || len < ihl + 8) return null
        if ((buf[9].toInt() and 0xFF) != PROTO_UDP) return null
        // Ignore fragments (MF flag or a fragment offset) — DNS queries never fragment.
        if ((u16(buf, 6) and 0x3FFF) != 0) return null
        if (u16(buf, ihl + 2) != DNS_PORT) return null

        val udpLen = u16(buf, ihl + 4)
        val dnsOffset = ihl + 8
        val dnsLength = minOf(udpLen - 8, len - dnsOffset)
        if (dnsLength < 12) return null

        val packet = buf.copyOf(len)
        val question = parseQuestion(packet, dnsOffset, dnsLength)
        return DnsQuery(
            packet = packet,
            ipHeaderLen = ihl,
            dnsOffset = dnsOffset,
            dnsLength = dnsLength,
            domain = question?.first,
            questionEnd = question?.second ?: -1,
        )
    }

    /** Parses the first question. Returns (name, endOfQuestion relative to [off]). */
    fun parseQuestion(b: ByteArray, off: Int, len: Int): Pair<String, Int>? {
        if (len < 12) return null
        if (u16(b, off + 4) < 1) return null // QDCOUNT
        val limit = off + len
        var i = off + 12
        val name = StringBuilder()
        while (true) {
            if (i >= limit) return null
            val labelLen = b[i].toInt() and 0xFF
            if (labelLen == 0) {
                i++
                break
            }
            // Compression pointers never appear in a query's first name.
            if ((labelLen and 0xC0) != 0) return null
            if (i + 1 + labelLen > limit) return null
            if (name.isNotEmpty()) name.append('.')
            for (k in 1..labelLen) {
                name.append((b[i + k].toInt() and 0xFF).toChar().lowercaseChar())
            }
            i += 1 + labelLen
            if (name.length > 253) return null
        }
        if (i + 4 > limit) return null // QTYPE + QCLASS
        return name.toString() to (i + 4 - off)
    }

    /**
     * Builds an NXDOMAIN answer for a blocked query: the original header and
     * question with the response bits set and every other section dropped.
     */
    fun blockedDnsResponse(q: DnsQuery): ByteArray {
        val r = q.packet.copyOfRange(q.dnsOffset, q.dnsOffset + q.questionEnd)
        // QR=1, keep opcode and RD, clear AA/TC.
        r[2] = (0x80 or (r[2].toInt() and 0x79)).toByte()
        // RA=1, RCODE=3 (NXDOMAIN).
        r[3] = 0x83.toByte()
        put16(r, 4, 1) // QDCOUNT
        put16(r, 6, 0) // ANCOUNT
        put16(r, 8, 0) // NSCOUNT
        put16(r, 10, 0) // ARCOUNT
        return r
    }

    /**
     * Wraps a DNS [payload] in an IPv4/UDP packet addressed back to whoever
     * sent [q], as if it came from the DNS server they queried.
     */
    fun buildReply(q: DnsQuery, payload: ByteArray, payloadLen: Int = payload.size): ByteArray {
        val req = q.packet
        val ihl = q.ipHeaderLen
        val udpLen = 8 + payloadLen
        val total = 20 + udpLen
        val out = ByteArray(total)

        // IPv4 header
        out[0] = 0x45.toByte() // version 4, IHL 5
        put16(out, 2, total)
        put16(out, 6, 0x4000) // DF
        out[8] = 64.toByte() // TTL
        out[9] = PROTO_UDP.toByte()
        System.arraycopy(req, 16, out, 12, 4) // src = original dst (our virtual DNS)
        System.arraycopy(req, 12, out, 16, 4) // dst = original src (the app)
        put16(out, 10, checksum(out, 0, 20, 0))

        // UDP header
        System.arraycopy(req, ihl + 2, out, 20, 2) // src port = 53
        System.arraycopy(req, ihl, out, 22, 2) // dst port = app's port
        put16(out, 24, udpLen)
        System.arraycopy(payload, 0, out, 28, payloadLen)

        // UDP checksum over the pseudo-header + datagram.
        var pseudo = 0
        pseudo += u16(out, 12) + u16(out, 14) + u16(out, 16) + u16(out, 18)
        pseudo += PROTO_UDP + udpLen
        var csum = checksum(out, 20, udpLen, pseudo)
        if (csum == 0) csum = 0xFFFF
        put16(out, 26, csum)
        return out
    }

    /** Internet checksum (RFC 1071) of [len] bytes at [off], seeded with [initial]. */
    fun checksum(b: ByteArray, off: Int, len: Int, initial: Int): Int {
        var sum = initial.toLong()
        var i = off
        val end = off + len
        while (i + 1 < end) {
            sum += u16(b, i)
            i += 2
        }
        if (i < end) sum += (b[i].toInt() and 0xFF) shl 8
        while ((sum ushr 16) != 0L) sum = (sum and 0xFFFF) + (sum ushr 16)
        return sum.inv().toInt() and 0xFFFF
    }

    fun u16(b: ByteArray, i: Int): Int =
        ((b[i].toInt() and 0xFF) shl 8) or (b[i + 1].toInt() and 0xFF)

    fun put16(b: ByteArray, i: Int, v: Int) {
        b[i] = (v ushr 8).toByte()
        b[i + 1] = v.toByte()
    }
}
