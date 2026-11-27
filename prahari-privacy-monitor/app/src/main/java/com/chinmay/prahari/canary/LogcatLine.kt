package com.chinmay.prahari.canary

/** One line of `logcat -v threadtime -v uid`. Pure, unit-tested. */
data class LogcatLine(val time: String, val uidRaw: String, val uid: Int?, val pid: Int, val level: Char, val tag: String, val message: String) {
    companion object {
        private val WITH_UID = Regex("""^(\d\d-\d\d \d\d:\d\d:\d\d\.\d+)\s+(\S+)\s+(\d+)\s+(\d+)\s+([VDIWEFA])\s+(.*?)\s*: (.*)$""")
        private val NO_UID = Regex("""^(\d\d-\d\d \d\d:\d\d:\d\d\.\d+)\s+(\d+)\s+(\d+)\s+([VDIWEFA])\s+(.*?)\s*: (.*)$""")
        private val APP_UID = Regex("""^u(\d+)_a(\d+)$""")
        private val NAMED = mapOf("root" to 0, "system" to 1000, "radio" to 1001, "bluetooth" to 1002, "shell" to 2000, "nobody" to 9999)

        fun parse(line: String): LogcatLine? {
            WITH_UID.matchEntire(line)?.let { m ->
                val (t, u, pid, _, lvl, tag, msg) = m.destructured
                return LogcatLine(t, u, uidOf(u), pid.toInt(), lvl[0], tag, msg)
            }
            NO_UID.matchEntire(line)?.let { m ->
                val (t, pid, _, lvl, tag, msg) = m.destructured
                return LogcatLine(t, "?", null, pid.toInt(), lvl[0], tag, msg)
            }
            return null
        }

        /** "u0_a123" → 10123, "10123" → 10123, "system" → 1000. */
        fun uidOf(s: String): Int? {
            s.toIntOrNull()?.let { return it }
            APP_UID.matchEntire(s)?.let { m ->
                val (user, app) = m.destructured
                return user.toInt() * 100_000 + 10_000 + app.toInt()
            }
            return NAMED[s]
        }
    }
}
