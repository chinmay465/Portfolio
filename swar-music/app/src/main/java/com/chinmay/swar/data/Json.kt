package com.chinmay.swar.data

import org.json.JSONArray
import org.json.JSONObject

/*
 * Small helpers for walking YouTube Music's JSON. Every lookup is null-safe:
 * the response format shifts often, and a missing field must never crash.
 */

/** Follow a path of object keys (String) and array indexes (Int). */
internal fun Any?.at(vararg path: Any): Any? {
    var node: Any? = this
    for (step in path) {
        node = when {
            node is JSONObject && step is String -> node.opt(step)
            node is JSONArray && step is Int -> if (step in 0 until node.length()) node.opt(step) else null
            else -> return null
        }
        if (node == JSONObject.NULL) return null
    }
    return node
}

internal fun Any?.obj(vararg path: Any): JSONObject? = at(*path) as? JSONObject
internal fun Any?.arr(vararg path: Any): JSONArray? = at(*path) as? JSONArray
internal fun Any?.str(vararg path: Any): String? = (at(*path) as? String)?.takeIf { it.isNotEmpty() }

internal fun JSONArray?.objects(): List<JSONObject> {
    if (this == null) return emptyList()
    return (0 until length()).mapNotNull { optJSONObject(it) }
}

/** Text of a {runs: [...]} or {simpleText: "..."} object. */
internal fun text(node: Any?): String {
    val o = node as? JSONObject ?: return ""
    o.str("simpleText")?.let { return it }
    return o.arr("runs").objects().joinToString("") { it.optString("text") }
}

internal fun runs(node: Any?): List<JSONObject> = (node as? JSONObject).arr("runs").objects()

/**
 * Depth-first walk. [visit] gets each object's key (or null for array
 * elements) and the object; return false to skip its children.
 */
internal fun walk(node: Any?, key: String? = null, visit: (String?, JSONObject) -> Boolean) {
    when (node) {
        is JSONObject -> {
            if (!visit(key, node)) return
            val keys = node.keys()
            while (keys.hasNext()) {
                val k = keys.next()
                walk(node.opt(k), k, visit)
            }
        }
        is JSONArray -> for (i in 0 until node.length()) walk(node.opt(i), null, visit)
    }
}

/** First object stored under [key] anywhere below [node]. */
internal fun find(node: Any?, key: String): JSONObject? {
    var found: JSONObject? = null
    walk(node) { _, o ->
        if (found != null) return@walk false
        o.optJSONObject(key)?.let { found = it; return@walk false }
        true
    }
    return found
}

/** The largest thumbnail anywhere below [node], upscaled where Google's image servers allow it. */
internal fun thumbnail(node: Any?): String {
    var best = ""
    var bestWidth = -1
    walk(node) { k, o ->
        if (k == "navigationEndpoint" || k == "menu") return@walk false
        val list = o.optJSONArray("thumbnails")
        if (list != null) {
            for (t in list.objects()) {
                val w = t.optInt("width", 0)
                val url = t.optString("url")
                if (url.isNotEmpty() && w > bestWidth) { best = url; bestWidth = w }
            }
            return@walk false
        }
        true
    }
    return upscale(best)
}

private val SIZE = Regex("""=w\d+-h\d+""")
private val SQUARE = Regex("""=s\d+""")

/** lh3/yt3 image URLs carry their size; ask for a sharp one. ytimg URLs are left as they are. */
internal fun upscale(url: String, px: Int = 544): String {
    if (url.isEmpty()) return url
    val full = if (url.startsWith("//")) "https:$url" else url
    if (!full.contains("googleusercontent.com") && !full.contains("ggpht.com")) return full
    return when {
        SIZE.containsMatchIn(full) -> full.replace(SIZE, "=w$px-h$px")
        SQUARE.containsMatchIn(full) -> full.replace(SQUARE, "=s$px")
        else -> full
    }
}
