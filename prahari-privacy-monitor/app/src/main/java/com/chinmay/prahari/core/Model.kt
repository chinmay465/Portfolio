package com.chinmay.prahari.core

import android.Manifest

/** Something private an app can reach: a sensor, a data store or the clipboard. */
enum class Kind(val id: String, val label: String, val perms: List<String>) {
    CAMERA("camera", "Camera", listOf(Manifest.permission.CAMERA)),
    MIC("mic", "Microphone", listOf(Manifest.permission.RECORD_AUDIO)),
    GPS("gps", "GPS", listOf(Manifest.permission.ACCESS_FINE_LOCATION)),
    LOCATION("location", "Location", listOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)),
    CLIPBOARD("clipboard", "Clipboard", emptyList()),
    CONTACTS("contacts", "Contacts", listOf(Manifest.permission.READ_CONTACTS)),
    CALL_LOG("call_log", "Call log", listOf(Manifest.permission.READ_CALL_LOG)),
    SMS("sms", "SMS", listOf(Manifest.permission.READ_SMS, Manifest.permission.RECEIVE_SMS)),
    CALENDAR("calendar", "Calendar", listOf(Manifest.permission.READ_CALENDAR)),
    PHONE("phone", "Phone number & state", listOf(Manifest.permission.READ_PHONE_STATE)),
    SENSORS("sensors", "Body sensors", listOf(Manifest.permission.BODY_SENSORS)),
    ACTIVITY("activity", "Physical activity", listOf(Manifest.permission.ACTIVITY_RECOGNITION)),
    MEDIA("media", "Photos, videos & files", listOf(Manifest.permission.READ_EXTERNAL_STORAGE)),
    NEARBY("nearby", "Nearby devices", emptyList()),
    ACCOUNTS("accounts", "Accounts on the phone", emptyList());

    companion object {
        private val byId = entries.associateBy { it.id }
        fun of(id: String): Kind? = byId[id]

        /** Sensors you can't see being used: these get alerts and a live status. */
        val LIVE = listOf(CAMERA, MIC, GPS)
    }
}

enum class Source { LIVE, OPS }

/** How sure Prahari is about which app did it. */
enum class Confidence(val label: String) {
    EXACT("Exact"), // Android's own access record (precision mode)
    LIKELY("Likely"), // the app on screen, and it holds the permission
    POSSIBLE("One of"), // apps running in the background that hold the permission
    UNKNOWN("Unknown"),
}

/** One use of a [Kind]: a camera session, a mic recording, a clipboard read… */
data class Access(
    val id: Long = 0,
    val kind: Kind,
    /** Best guess at the app, or null if nobody could be pinned down. */
    val pkg: String?,
    /** Every app that could have done it (for [Confidence.POSSIBLE]). */
    val candidates: List<String>,
    val start: Long,
    /** Null while still running. */
    val end: Long?,
    val screenOff: Boolean,
    /** True when the app wasn't on screen: the case worth worrying about. */
    val background: Boolean,
    val source: Source,
    /** Extra facts: mic source, camera id, duration from Android's record… */
    val detail: String? = null,
) {
    val confidence: Confidence
        get() = when {
            source == Source.OPS -> Confidence.EXACT
            pkg != null && !background -> Confidence.LIKELY
            pkg != null || candidates.isNotEmpty() -> Confidence.POSSIBLE
            else -> Confidence.UNKNOWN
        }

    val running: Boolean get() = end == null

    fun durationMs(now: Long): Long = (end ?: now) - start
}

/** A domain an app looked up while DNS watch was on. */
data class DnsHit(
    val pkg: String?,
    val domain: String,
    val first: Long,
    val last: Long,
    val count: Int,
    val bgCount: Int,
    /** Tracker company, if the domain belongs to a known tracker. */
    val tracker: String?,
)
