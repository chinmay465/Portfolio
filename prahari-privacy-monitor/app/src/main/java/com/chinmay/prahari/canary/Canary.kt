package com.chinmay.prahari.canary

import android.content.Context
import android.content.pm.PackageManager
import java.security.SecureRandom

/**
 * The canary test answers "is this app writing down what I type?". You type
 * a made-up word into the app (its search box, a chat, a form), then Prahari
 * searches the phone's shared log for it. Apps that log your input can ship
 * those logs to their servers later, and any app with log access can read them.
 */
object Canary {

    const val READ_LOGS = "android.permission.READ_LOGS"
    const val ADB_GRANT = "adb shell pm grant com.chinmay.prahari android.permission.READ_LOGS"

    private val rnd = SecureRandom()
    private const val ALPHABET = "bcdfghjkmnpqrstvwxz"

    /** A word no app, dictionary or log would contain by chance, e.g. "zqkatmvrp". */
    fun newWord(): String = "zq" + (1..7).map { ALPHABET[rnd.nextInt(ALPHABET.length)] }.joinToString("")

    fun canReadLogs(ctx: Context): Boolean = ctx.checkSelfPermission(READ_LOGS) == PackageManager.PERMISSION_GRANTED

    data class Hit(val time: String, val pkg: String?, val uidLabel: String, val tag: String, val message: String)

    data class Result(val hits: List<Hit>, val linesRead: Int, val sawOtherApps: Boolean, val error: String?)

    /** Runs `logcat -d` once and returns the lines that contain [word]. */
    fun check(ctx: Context, word: String): Result {
        val pm = ctx.packageManager
        val hits = ArrayList<Hit>()
        var lines = 0
        var others = false
        val myUid = android.os.Process.myUid()
        val error = try {
            val proc = ProcessBuilder("logcat", "-d", "-v", "threadtime", "-v", "uid", "-t", "200000")
                .redirectErrorStream(true)
                .start()
            proc.inputStream.bufferedReader().useLines { seq ->
                for (raw in seq) {
                    lines++
                    val line = LogcatLine.parse(raw) ?: continue
                    if (line.uid != null && line.uid != myUid) others = true
                    if (!raw.contains(word, ignoreCase = true)) continue
                    val pkg = line.uid?.let { pm.getPackagesForUid(it)?.firstOrNull() }
                    if (pkg == ctx.packageName) continue
                    hits += Hit(line.time, pkg, line.uidRaw, line.tag, line.message.take(300))
                    if (hits.size >= 200) break
                }
            }
            proc.destroy()
            null
        } catch (e: Exception) {
            e.message ?: "logcat failed"
        }
        return Result(hits, lines, others, error)
    }
}
