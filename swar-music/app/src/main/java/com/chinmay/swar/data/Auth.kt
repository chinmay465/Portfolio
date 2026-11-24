package com.chinmay.swar.data

import java.security.MessageDigest

/** Signed-in requests: YouTube's SAPISIDHASH scheme, computed from the session cookie. */
object Auth {
    fun cookies(header: String): Map<String, String> = header.split(';').mapNotNull { part ->
        val i = part.indexOf('=')
        if (i <= 0) null else part.substring(0, i).trim() to part.substring(i + 1).trim()
    }.toMap()

    /** The cookie that proves the session; null when signed out. */
    fun sapisid(cookieHeader: String?): String? {
        if (cookieHeader.isNullOrBlank()) return null
        val c = cookies(cookieHeader)
        return (c["SAPISID"] ?: c["__Secure-3PAPISID"])?.takeIf { it.isNotEmpty() }
    }

    fun sapisidHash(sapisid: String, origin: String, epochSeconds: Long): String {
        val digest = MessageDigest.getInstance("SHA-1").digest("$epochSeconds $sapisid $origin".toByteArray())
        return "SAPISIDHASH ${epochSeconds}_" + digest.joinToString("") { "%02x".format(it) }
    }
}
