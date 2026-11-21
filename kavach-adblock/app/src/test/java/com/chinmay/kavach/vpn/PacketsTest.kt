package com.chinmay.kavach.vpn

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class PacketsTest {

    /** IPv4/UDP DNS query for [name] from 10.111.222.1:40000 to 10.111.222.53:53. */
    private fun query(name: String, qtype: Int = 1): ByteArray {
        val qname = name.split('.').flatMap { listOf(it.length.toByte()) + it.toByteArray().toList() } + 0.toByte()
        val dns = byteArrayOf(0x12, 0x34, 0x01, 0x00, 0, 1, 0, 0, 0, 0, 0, 0) +
            qname.toByteArray() + byteArrayOf(0, qtype.toByte(), 0, 1)
        val udpLen = 8 + dns.size
        val total = 20 + udpLen
        val p = ByteArray(total)
        p[0] = 0x45
        Packets.put16(p, 2, total)
        p[8] = 64
        p[9] = 17
        byteArrayOf(10, 111, 222.toByte(), 1).copyInto(p, 12)
        byteArrayOf(10, 111, 222.toByte(), 53).copyInto(p, 16)
        Packets.put16(p, 10, Packets.checksum(p, 0, 20, 0))
        Packets.put16(p, 20, 40000)
        Packets.put16(p, 22, 53)
        Packets.put16(p, 24, udpLen)
        dns.copyInto(p, 28)
        return p
    }

    @Test
    fun parsesQueryName() {
        val p = query("Ads.DoubleClick.net")
        val q = Packets.parseDnsQuery(p, p.size)
        assertNotNull(q)
        assertEquals("ads.doubleclick.net", q!!.domain)
    }

    @Test
    fun ignoresNonDns() {
        val p = query("example.com")
        Packets.put16(p, 22, 443)
        assertNull(Packets.parseDnsQuery(p, p.size))
    }

    @Test
    fun blockedReplyIsValidNxdomain() {
        val p = query("ads.example.com")
        val q = Packets.parseDnsQuery(p, p.size)!!
        val reply = Packets.buildReply(q, Packets.blockedDnsResponse(q))

        // IPv4 header checksum verifies to zero.
        assertEquals(0, Packets.checksum(reply, 0, 20, 0))
        // Addresses and ports are swapped.
        assertEquals(53, Packets.u16(reply, 20))
        assertEquals(40000, Packets.u16(reply, 22))
        assertEquals(10, reply[12].toInt())
        assertEquals(53, reply[15].toInt() and 0xFF)
        // Same transaction id, QR set, RCODE = NXDOMAIN.
        assertEquals(0x1234, Packets.u16(reply, 28))
        assertEquals(0x80, reply[30].toInt() and 0x80)
        assertEquals(3, reply[31].toInt() and 0x0F)
        // UDP checksum verifies to zero with the pseudo-header.
        val udpLen = Packets.u16(reply, 24)
        val pseudo = Packets.u16(reply, 12) + Packets.u16(reply, 14) +
            Packets.u16(reply, 16) + Packets.u16(reply, 18) + 17 + udpLen
        assertEquals(0, Packets.checksum(reply, 20, udpLen, pseudo))
    }
}
