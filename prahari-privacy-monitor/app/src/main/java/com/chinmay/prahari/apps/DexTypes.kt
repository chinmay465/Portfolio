package com.chinmay.prahari.apps

import java.io.File
import java.io.InputStream
import java.util.zip.ZipFile

/**
 * Reads the class names out of a dex file without loading or running any of
 * its code: header → type_ids → string_ids → string data. Pure JVM, so it is
 * unit-tested with hand-built dex bytes.
 */
object DexTypes {

    /** Calls [visit] with every type descriptor in [dex] (e.g. `Lcom/foo/Bar;`). */
    fun forEach(dex: ByteArray, visit: (String) -> Unit) {
        if (dex.size < 0x70) return
        if (dex[0] != 'd'.code.toByte() || dex[1] != 'e'.code.toByte() || dex[2] != 'x'.code.toByte() || dex[3] != '\n'.code.toByte()) return
        val stringIdsSize = u32(dex, 0x38)
        val stringIdsOff = u32(dex, 0x3C)
        val typeIdsSize = u32(dex, 0x40)
        val typeIdsOff = u32(dex, 0x44)
        if (typeIdsSize <= 0 || typeIdsOff <= 0 || typeIdsOff + typeIdsSize.toLong() * 4 > dex.size) return
        if (stringIdsOff <= 0 || stringIdsOff + stringIdsSize.toLong() * 4 > dex.size) return

        for (i in 0 until typeIdsSize) {
            val descIdx = u32(dex, typeIdsOff + i * 4)
            if (descIdx < 0 || descIdx >= stringIdsSize) continue
            var p = u32(dex, stringIdsOff + descIdx * 4)
            if (p <= 0 || p >= dex.size) continue
            // Skip the uleb128 utf16 length.
            var guard = 0
            while (p < dex.size && (dex[p].toInt() and 0x80) != 0 && guard++ < 5) p++
            p++
            val start = p
            // Only class types are interesting, and they are plain ASCII.
            if (start >= dex.size || dex[start] != 'L'.code.toByte()) continue
            while (p < dex.size && dex[p] != 0.toByte()) p++
            visit(String(dex, start, p - start, Charsets.ISO_8859_1))
        }
    }

    /** Ids of the tracker SDKs found in one dex file. */
    fun trackersIn(dex: ByteArray): Set<String> {
        val found = HashSet<String>()
        forEach(dex) { d ->
            if (d.startsWith("Landroid") || d.startsWith("Ljava") || d.startsWith("Lkotlin")) return@forEach
            TrackerSdks.match(d)?.let { found += it.id }
        }
        return found
    }

    /** Scans every classes*.dex inside the APKs at [paths] (base + splits). */
    fun trackersInApks(paths: List<String>): Set<String> {
        val found = HashSet<String>()
        for (path in paths) {
            val f = File(path)
            if (!f.canRead()) continue
            try {
                ZipFile(f).use { zip ->
                    val entries = zip.entries()
                    while (entries.hasMoreElements()) {
                        val e = entries.nextElement()
                        if (!DEX_NAME.matches(e.name)) continue
                        if (e.size > MAX_DEX) continue
                        val bytes = zip.getInputStream(e).use { it.readFully(e.size) }
                        found += trackersIn(bytes)
                    }
                }
            } catch (_: Exception) {
                // Unreadable or odd APK: report what we have.
            }
        }
        return found
    }

    private fun InputStream.readFully(size: Long): ByteArray =
        if (size in 1..Int.MAX_VALUE) {
            val out = ByteArray(size.toInt())
            var n = 0
            while (n < out.size) {
                val r = read(out, n, out.size - n)
                if (r < 0) break
                n += r
            }
            out
        } else {
            readBytes()
        }

    private val DEX_NAME = Regex("classes\\d*\\.dex")
    private const val MAX_DEX = 96L * 1024 * 1024

    private fun u32(b: ByteArray, i: Int): Int =
        (b[i].toInt() and 0xFF) or ((b[i + 1].toInt() and 0xFF) shl 8) or
            ((b[i + 2].toInt() and 0xFF) shl 16) or ((b[i + 3].toInt() and 0xFF) shl 24)
}
