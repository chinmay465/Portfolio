package com.chinmay.prahari.data

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.chinmay.prahari.core.Access
import com.chinmay.prahari.core.DnsHit
import com.chinmay.prahari.core.Kind
import com.chinmay.prahari.core.Source

/**
 * Everything Prahari learns stays in this one on-device database. It is
 * excluded from backups and device transfers and never leaves the phone.
 */
class Db private constructor(context: Context) :
    SQLiteOpenHelper(context, "prahari.db", null, 1) {

    override fun onConfigure(db: SQLiteDatabase) {
        db.enableWriteAheadLogging()
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """CREATE TABLE access (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kind TEXT NOT NULL, pkg TEXT, candidates TEXT NOT NULL DEFAULT '',
                start INTEGER NOT NULL, end_ts INTEGER,
                screen_off INTEGER NOT NULL, background INTEGER NOT NULL,
                source TEXT NOT NULL, detail TEXT)""",
        )
        db.execSQL("CREATE INDEX access_start ON access(start)")
        db.execSQL("CREATE INDEX access_pkg ON access(pkg)")
        db.execSQL(
            """CREATE TABLE dns (
                pkg TEXT NOT NULL, domain TEXT NOT NULL,
                first INTEGER NOT NULL, last INTEGER NOT NULL,
                count INTEGER NOT NULL, bg_count INTEGER NOT NULL,
                PRIMARY KEY(pkg, domain))""",
        )
        db.execSQL("CREATE INDEX dns_last ON dns(last)")
        db.execSQL(
            """CREATE TABLE ops_seen (
                pkg TEXT NOT NULL, op TEXT NOT NULL, last INTEGER NOT NULL,
                PRIMARY KEY(pkg, op))""",
        )
        db.execSQL(
            """CREATE TABLE scan (
                pkg TEXT PRIMARY KEY, stamp TEXT NOT NULL, trackers TEXT NOT NULL,
                scanned INTEGER NOT NULL)""",
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

    // ---- access ----

    fun insert(a: Access): Long = writableDatabase.insert("access", null, a.values())

    fun finish(id: Long, end: Long, detail: String? = null) {
        val v = ContentValues().apply {
            put("end_ts", end)
            if (detail != null) put("detail", detail)
        }
        writableDatabase.update("access", v, "id = ?", arrayOf(id.toString()))
    }

    fun delete(id: Long) {
        writableDatabase.delete("access", "id = ?", arrayOf(id.toString()))
    }

    fun reattribute(id: Long, pkg: String?, candidates: List<String>, background: Boolean, source: Source = Source.OPS) {
        val v = ContentValues().apply {
            put("pkg", pkg)
            put("candidates", if (candidates.isEmpty()) "" else candidates.joinToString("|", "|", "|"))
            put("background", if (background) 1 else 0)
            put("source", source.name)
        }
        writableDatabase.update("access", v, "id = ?", arrayOf(id.toString()))
    }

    /** Is there already a [kind] row for [pkg] that started within [window] ms of [t]? */
    fun hasNear(kind: Kind, pkg: String, t: Long, window: Long): Boolean =
        readableDatabase.rawQuery(
            "SELECT 1 FROM access WHERE kind = ? AND (pkg = ? OR candidates LIKE ?) AND start BETWEEN ? AND ? LIMIT 1",
            arrayOf(kind.id, pkg, "%|$pkg|%", (t - window).toString(), (t + window).toString()),
        ).use { it.moveToFirst() }

    /** Closes rows left open when the process died mid-session. */
    fun closeDangling(now: Long) {
        writableDatabase.execSQL("UPDATE access SET end_ts = ? WHERE end_ts IS NULL", arrayOf(now))
    }

    fun accesses(since: Long, pkg: String? = null, limit: Int = 500): List<Access> {
        val where = if (pkg == null) "start >= ?" else "start >= ? AND (pkg = ? OR candidates LIKE ?)"
        val args = if (pkg == null) arrayOf(since.toString()) else arrayOf(since.toString(), pkg, "%|$pkg|%")
        readableDatabase.query("access", null, where, args, null, null, "start DESC", limit.toString()).use { c ->
            val out = ArrayList<Access>(c.count)
            while (c.moveToNext()) {
                val kind = Kind.of(c.getString(c.getColumnIndexOrThrow("kind"))) ?: continue
                out += Access(
                    id = c.getLong(c.getColumnIndexOrThrow("id")),
                    kind = kind,
                    pkg = c.getString(c.getColumnIndexOrThrow("pkg")),
                    candidates = c.getString(c.getColumnIndexOrThrow("candidates")).split('|').filter { it.isNotEmpty() },
                    start = c.getLong(c.getColumnIndexOrThrow("start")),
                    end = c.getColumnIndexOrThrow("end_ts").let { if (c.isNull(it)) null else c.getLong(it) },
                    screenOff = c.getInt(c.getColumnIndexOrThrow("screen_off")) == 1,
                    background = c.getInt(c.getColumnIndexOrThrow("background")) == 1,
                    source = Source.valueOf(c.getString(c.getColumnIndexOrThrow("source"))),
                    detail = c.getString(c.getColumnIndexOrThrow("detail")),
                )
            }
            return out
        }
    }

    // ---- dns ----

    /** Adds a batch of lookups: (pkg, domain, time, inBackground). */
    fun addDns(batch: List<DnsRow>) {
        if (batch.isEmpty()) return
        val db = writableDatabase
        db.beginTransaction()
        try {
            // Android 10's SQLite predates UPSERT, so insert-or-ignore then bump.
            val insert = db.compileStatement(
                "INSERT OR IGNORE INTO dns(pkg, domain, first, last, count, bg_count) VALUES(?, ?, ?, ?, 0, 0)",
            )
            val bump = db.compileStatement(
                "UPDATE dns SET last = MAX(last, ?), count = count + 1, bg_count = bg_count + ? WHERE pkg = ? AND domain = ?",
            )
            for (r in batch) {
                insert.clearBindings()
                insert.bindString(1, r.pkg)
                insert.bindString(2, r.domain)
                insert.bindLong(3, r.time)
                insert.bindLong(4, r.time)
                insert.executeInsert()
                bump.clearBindings()
                bump.bindLong(1, r.time)
                bump.bindLong(2, if (r.background) 1 else 0)
                bump.bindString(3, r.pkg)
                bump.bindString(4, r.domain)
                bump.executeUpdateDelete()
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    fun dns(since: Long, pkg: String? = null, limit: Int = 1000, tracker: (String) -> String?): List<DnsHit> {
        val where = if (pkg == null) "last >= ?" else "last >= ? AND pkg = ?"
        val args = if (pkg == null) arrayOf(since.toString()) else arrayOf(since.toString(), pkg)
        readableDatabase.query("dns", null, where, args, null, null, "count DESC", limit.toString()).use { c ->
            val out = ArrayList<DnsHit>(c.count)
            while (c.moveToNext()) {
                val domain = c.getString(1)
                out += DnsHit(
                    pkg = c.getString(0).takeIf { it != UNKNOWN_PKG },
                    domain = domain,
                    first = c.getLong(2),
                    last = c.getLong(3),
                    count = c.getInt(4),
                    bgCount = c.getInt(5),
                    tracker = tracker(domain),
                )
            }
            return out
        }
    }

    // ---- precision-mode bookkeeping ----

    fun opsSeen(): MutableMap<String, Long> {
        val out = HashMap<String, Long>()
        readableDatabase.rawQuery("SELECT pkg, op, last FROM ops_seen", null).use { c ->
            while (c.moveToNext()) out["${c.getString(0)}|${c.getString(1)}"] = c.getLong(2)
        }
        return out
    }

    fun setOpSeen(pkg: String, op: String, last: Long) {
        writableDatabase.execSQL(
            "INSERT OR REPLACE INTO ops_seen(pkg, op, last) VALUES(?, ?, ?)",
            arrayOf(pkg, op, last),
        )
    }

    // ---- tracker SDK scan cache ----

    fun scans(): Map<String, ScanRow> {
        val out = HashMap<String, ScanRow>()
        readableDatabase.rawQuery("SELECT pkg, stamp, trackers, scanned FROM scan", null).use { c ->
            while (c.moveToNext()) {
                out[c.getString(0)] = ScanRow(c.getString(1), c.getString(2).split(',').filter { it.isNotEmpty() }, c.getLong(3))
            }
        }
        return out
    }

    fun putScan(pkg: String, row: ScanRow) {
        writableDatabase.execSQL(
            "INSERT OR REPLACE INTO scan(pkg, stamp, trackers, scanned) VALUES(?, ?, ?, ?)",
            arrayOf(pkg, row.stamp, row.trackers.joinToString(","), row.scanned),
        )
    }

    // ---- housekeeping ----

    fun prune(before: Long) {
        val db = writableDatabase
        db.delete("access", "start < ?", arrayOf(before.toString()))
        db.delete("dns", "last < ?", arrayOf(before.toString()))
    }

    fun clearHistory() {
        val db = writableDatabase
        db.delete("access", null, null)
        db.delete("dns", null, null)
    }

    fun counts(): Pair<Long, Long> {
        val a = readableDatabase.rawQuery("SELECT COUNT(*) FROM access", null).use { it.moveToFirst(); it.getLong(0) }
        val d = readableDatabase.rawQuery("SELECT COUNT(*) FROM dns", null).use { it.moveToFirst(); it.getLong(0) }
        return a to d
    }

    private fun Access.values() = ContentValues().apply {
        put("kind", kind.id)
        put("pkg", pkg)
        put("candidates", if (candidates.isEmpty()) "" else candidates.joinToString("|", "|", "|"))
        put("start", start)
        put("end_ts", end)
        put("screen_off", if (screenOff) 1 else 0)
        put("background", if (background) 1 else 0)
        put("source", source.name)
        put("detail", detail)
    }

    data class DnsRow(val pkg: String, val domain: String, val time: Long, val background: Boolean)
    data class ScanRow(val stamp: String, val trackers: List<String>, val scanned: Long)

    companion object {
        const val UNKNOWN_PKG = "?"

        @Volatile private var instance: Db? = null
        fun get(context: Context): Db =
            instance ?: synchronized(this) {
                instance ?: Db(context.applicationContext).also { instance = it }
            }
    }
}
