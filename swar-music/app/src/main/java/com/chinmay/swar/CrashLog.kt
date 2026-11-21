package com.chinmay.swar

import android.app.Activity
import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Build
import android.widget.Toast
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter

/**
 * If Swar crashes, the stack trace is written to the app's private storage and
 * shown once on the next launch, with a button to copy it. It never leaves the
 * phone unless you paste it somewhere yourself.
 */
object CrashLog {
    private const val FILE = "last-crash.txt"

    fun install(context: Context) {
        val file = File(context.filesDir, FILE)
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            runCatching {
                val trace = StringWriter().also { error.printStackTrace(PrintWriter(it)) }
                file.writeText(
                    "Swar ${BuildConfigInfo.version(context)} · Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})\n" +
                        "Thread: ${thread.name}\n\n$trace",
                )
            }
            previous?.uncaughtException(thread, error)
        }
    }

    fun showIfAny(activity: Activity) {
        val file = File(activity.filesDir, FILE)
        if (!file.exists()) return
        val report = runCatching { file.readText() }.getOrDefault("")
        file.delete()
        if (report.isBlank()) return
        AlertDialog.Builder(activity)
            .setTitle(R.string.crash_title)
            .setMessage(report.lineSequence().take(14).joinToString("\n"))
            .setPositiveButton(R.string.crash_copy) { _, _ ->
                activity.getSystemService(ClipboardManager::class.java)
                    .setPrimaryClip(ClipData.newPlainText("Swar crash", report))
                Toast.makeText(activity, R.string.crash_copied, Toast.LENGTH_SHORT).show()
            }
            .setNegativeButton(R.string.crash_dismiss, null)
            .show()
    }
}

private object BuildConfigInfo {
    fun version(context: Context): String = runCatching {
        context.packageManager.getPackageInfo(context.packageName, 0).versionName
    }.getOrNull() ?: "?"
}
