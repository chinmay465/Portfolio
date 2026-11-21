package com.chinmay.kavach.vpn

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DomainSetTest {

    private fun set(vararg lines: String) =
        DomainSet(HashSet<String>().also { DomainSet.parseInto(lines.asSequence(), it) })

    @Test
    fun matchesSubdomains() {
        val s = set("doubleclick.net")
        assertTrue(s.matches("doubleclick.net"))
        assertTrue(s.matches("ad.g.doubleclick.net"))
        assertFalse(s.matches("notdoubleclick.net"))
        assertFalse(s.matches("net"))
    }

    @Test
    fun parsesHostsFileFormat() {
        val s = set(
            "# comment",
            "127.0.0.1 localhost",
            "0.0.0.0 0.0.0.0",
            "0.0.0.0 ads.example.com   # trailing comment",
            "tracker.example.org",
            "::1 ip6-localhost",
        )
        assertEquals(2, s.size)
        assertTrue(s.matches("ads.example.com"))
        assertTrue(s.matches("tracker.example.org"))
        assertFalse(s.matches("example.com"))
    }

    @Test
    fun wildcardPatternsMatchWithinOneLabel() {
        val s = set("rr*---sn-ccoa-*.googlevideo.com")
        assertTrue(s.matches("rr2---sn-ccoa-cagz.googlevideo.com"))
        assertTrue(s.matches("rr1---sn-ccoa-cags.googlevideo.com"))
        assertTrue(s.matches("rr10---sn-ccoa-x9.googlevideo.com"))
        assertFalse(s.matches("rr2---sn-2ocvhc-50.googlevideo.com"))
        assertFalse(s.matches("googlevideo.com"))
        // * never crosses a dot
        assertFalse(s.matches("rr2.evil---sn-ccoa-x.googlevideo.com"))
    }

    @Test
    fun unsafePatternsInListsAreIgnored() {
        val s = set("*.com", "*", "ads.*.com", "*.example.com")
        assertFalse(s.matches("google.com"))
        assertTrue(s.matches("cdn.example.com"))
    }
}
