package com.chinmay.kavach.vpn

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DomainRulesTest {

    private fun ds(vararg d: String) = DomainSet(d.toSet())

    @Test
    fun listBlocksUnlessAllowed() {
        val list = ds("ads.example.com")
        assertTrue(DomainRules.isBlocked("x.ads.example.com", list, ds(), ds()))
        assertFalse(DomainRules.isBlocked("x.ads.example.com", list, ds(), ds("ads.example.com")))
    }

    @Test
    fun ownBlockBeatsAllow() {
        assertTrue(DomainRules.isBlocked("hesads.akamaized.net", ds(), ds("hesads.akamaized.net"), ds("akamaized.net")))
        assertFalse(DomainRules.isBlocked("other.akamaized.net", ds(), ds("hesads.akamaized.net"), ds()))
    }

    @Test
    fun blockAndAllowUpdateEachOther() {
        val (c1, a1) = DomainRules.block("ads.x.com", emptySet(), setOf("ads.x.com", "y.com"))
        assertEquals(setOf("ads.x.com"), c1)
        assertEquals(setOf("y.com"), a1)

        // Allowing a subdomain lifts the parent block that would still cover it.
        val (c2, a2) = DomainRules.allow("cdn.ads.x.com", setOf("ads.x.com", "z.com"), a1)
        assertEquals(setOf("z.com"), c2)
        assertEquals(setOf("y.com", "cdn.ads.x.com"), a2)
    }

    @Test
    fun normalizesUserInput() {
        assertEquals("ads.example.com", DomainRules.normalize("  https://Ads.Example.com/path?q=1 "))
        assertEquals("example.com", DomainRules.normalize("*.example.com"))
        assertEquals("example.com", DomainRules.normalize("example.com."))
        assertEquals("hesads.akamaized.net", DomainRules.normalize("hesads.akamaized.net:443"))
        assertNull(DomainRules.normalize("localhost"))
        assertNull(DomainRules.normalize("not a domain"))
        assertNull(DomainRules.normalize("1.2.3.4"))
        assertNull(DomainRules.normalize(""))
    }

    @Test
    fun normalizesWildcardPatterns() {
        assertEquals("rr*---sn-ccoa-*.googlevideo.com", DomainRules.normalize(" RR*---sn-ccoa-*.googlevideo.com "))
        assertEquals("ads*.example.com", DomainRules.normalize("https://ads*.example.com/x"))
        assertNull(DomainRules.normalize("*"))
        assertNull(DomainRules.normalize("*.com"))
        assertNull(DomainRules.normalize("ads.*.com"))
        assertNull(DomainRules.normalize("*.*"))
    }

    @Test
    fun allowingAHostLiftsAPatternBlockCoveringIt() {
        val (c, _) = DomainRules.allow("rr2---sn-ccoa-cagz.googlevideo.com", setOf("rr*---sn-ccoa-*.googlevideo.com", "z.com"), emptySet())
        assertEquals(setOf("z.com"), c)
        assertTrue(DomainRules.isBlocked("rr1---sn-ccoa-cags.googlevideo.com", ds(), ds("rr*---sn-ccoa-*.googlevideo.com"), ds()))
    }
}
