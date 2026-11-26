package com.chinmay.prahari.core

import com.chinmay.prahari.apps.Exposure
import com.chinmay.prahari.apps.Perm
import com.chinmay.prahari.apps.TrackerSdks

/**
 * Turns what Prahari knows about an app into a 0–100 privacy score with the
 * reasons behind it. Behaviour (what it actually did) weighs more than
 * capability (what it's allowed to do).
 */
object Risk {

    data class Input(
        val system: Boolean = false,
        val granted: Set<Perm> = emptySet(),
        val exposure: Exposure = Exposure(),
        val trackers: List<TrackerSdks.Sdk> = emptyList(),
        /** Camera/mic uses while the app wasn't on screen, last 7 days. */
        val bgSensorUses: Int = 0,
        /** Clipboard reads while not on screen (precision mode), last 7 days. */
        val bgClipboard: Int = 0,
        /** Location reads while not on screen (precision mode), last 7 days. */
        val bgLocation: Int = 0,
        val bgUploadBytes: Long = 0,
        val screenMinutes: Long = 0,
        /** Distinct tracker domains looked up (DNS watch). */
        val trackerDomains: Int = 0,
    )

    enum class Level(val label: String) { LOW("Low"), MEDIUM("Medium"), HIGH("High") }

    data class Reason(val points: Int, val text: String, val behaviour: Boolean)

    data class Result(val score: Int, val level: Level, val reasons: List<Reason>)

    fun score(i: Input): Result {
        val r = ArrayList<Reason>()
        val e = i.exposure

        // What it did.
        if (i.bgSensorUses > 0) r += Reason(minOf(30, 18 + 3 * i.bgSensorUses), "Used the camera or mic ${times(i.bgSensorUses)} while you weren't using it", true)
        if (i.bgClipboard > 0) r += Reason(minOf(16, 8 + 2 * i.bgClipboard), "Read your clipboard ${times(i.bgClipboard)} in the background", true)
        if (i.bgLocation > 0) r += Reason(minOf(12, 4 + i.bgLocation / 5), "Checked your location ${times(i.bgLocation)} in the background", true)
        val mb = i.bgUploadBytes / (1024 * 1024)
        when {
            mb >= 50 && i.screenMinutes < 10 -> r += Reason(15, "Sent $mb MB in the background though you used it for ${i.screenMinutes} min", true)
            mb >= 20 -> r += Reason(6, "Sent $mb MB while in the background", true)
        }
        if (i.trackerDomains > 0) r += Reason(minOf(12, 3 * i.trackerDomains), "Contacted ${i.trackerDomains} tracking server${if (i.trackerDomains == 1) "" else "s"}", true)

        // What it can see of your typing and screen.
        if (e.readsScreen) r += Reason(30, "Accessibility service that can read everything on screen, including text you type", false)
        else if (e.accessibility) r += Reason(12, "Runs an accessibility service", false)
        if (e.filtersKeys) r += Reason(10, "Can intercept key presses", false)
        if (e.keyboard && !i.system) r += Reason(if (e.defaultKeyboard) 25 else 15, "Is a keyboard: it receives every key you type" + if (e.defaultKeyboard) " (your current keyboard)" else "", false)
        if (e.notifications) r += Reason(15, "Reads all your notifications, including messages and OTPs", false)
        if (e.autofill) r += Reason(10, "Autofill service: sees the forms and passwords you fill", false)
        if (e.deviceAdmin) r += Reason(8, "Device admin: hard to uninstall, can lock or wipe the phone", false)

        // SDKs inside it.
        val byCat = i.trackers.groupBy { it.category }
        for ((cat, sdks) in byCat) {
            val pts = when (cat) {
                TrackerSdks.Category.SESSION_REPLAY, TrackerSdks.Category.LOCATION_DATA -> minOf(25, cat.weight + 5 * (sdks.size - 1))
                else -> minOf(12, cat.weight * sdks.size)
            }
            r += Reason(pts, "${cat.label}: " + sdks.joinToString(", ") { it.name }, false)
        }

        // What it's allowed to touch.
        val perms = i.granted.filter { it.sensitive >= 4 }.sortedByDescending { it.sensitive }
        if (perms.isNotEmpty()) {
            r += Reason(minOf(20, perms.sumOf { it.sensitive } / 2), "Allowed: " + perms.joinToString(", ") { it.label.lowercase() }, false)
        }

        var total = r.sumOf { it.points }
        // Preinstalled apps can't be removed and are usually part of the phone; weigh capability less.
        if (i.system) total = r.sumOf { if (it.behaviour) it.points else it.points / 2 }
        total = total.coerceIn(0, 100)
        val level = when {
            total >= 50 -> Level.HIGH
            total >= 25 -> Level.MEDIUM
            else -> Level.LOW
        }
        return Result(total, level, r.sortedByDescending { it.points })
    }

    private fun times(n: Int) = if (n == 1) "once" else "$n times"
}
