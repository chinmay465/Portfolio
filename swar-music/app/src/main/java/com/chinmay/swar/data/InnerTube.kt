package com.chinmay.swar.data

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException
import java.net.URLEncoder
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * YouTube Music's own web API (InnerTube, client WEB_REMIX): the same requests
 * music.youtube.com sends for Home, Search, album/artist/playlist pages, Up next,
 * likes and the library. Signed in, they carry the session cookie.
 */
class InnerTube(context: Context, private val http: OkHttpClient, private val account: Account) {
    private val prefs = context.getSharedPreferences("swar_innertube", Context.MODE_PRIVATE)
    @Volatile private var visitorData: String? = prefs.getString(KEY_VISITOR, null)

    private val country: String = Locale.getDefault().country.takeIf { it.length == 2 } ?: "IN"

    /** The web client's version is its build date; yesterday's is always accepted. */
    private fun clientVersion(): String {
        val format = SimpleDateFormat("yyyyMMdd", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
        return "1." + format.format(Date(System.currentTimeMillis() - 86_400_000L)) + ".01.00"
    }

    private fun context(): JSONObject {
        val client = JSONObject()
            .put("clientName", "WEB_REMIX")
            .put("clientVersion", clientVersion())
            .put("hl", "en")
            .put("gl", country)
        visitorData?.let { client.put("visitorData", it) }
        return JSONObject().put("client", client).put("user", JSONObject())
    }

    suspend fun call(endpoint: String, body: JSONObject = JSONObject(), query: String = ""): JSONObject =
        withContext(Dispatchers.IO) {
            body.put("context", context())
            val request = Request.Builder()
                .url("$API$endpoint?prettyPrint=false$query")
                .post(body.toString().toRequestBody(JSON))
                .header("User-Agent", USER_AGENT)
                .header("Origin", ORIGIN)
                .header("Referer", "$ORIGIN/")
                .header("X-Origin", ORIGIN)
                .header("Accept-Language", "en")
            val cookie = account.cookie
            val sapisid = Auth.sapisid(cookie)
            if (cookie != null && sapisid != null) {
                request.header("Cookie", cookie)
                request.header("Authorization", Auth.sapisidHash(sapisid, ORIGIN, System.currentTimeMillis() / 1000))
                request.header("X-Goog-AuthUser", "0")
            } else {
                request.header("Cookie", "SOCS=CAI") // no consent interstitial in the EU
            }
            visitorData?.let { request.header("X-Goog-Visitor-Id", it) }
            http.newCall(request.build()).execute().use { response ->
                val text = response.body?.string().orEmpty()
                if (!response.isSuccessful) throw IOException("YouTube Music answered HTTP ${response.code}")
                val json = JSONObject(text)
                json.str("responseContext", "visitorData")?.let { fresh ->
                    if (fresh != visitorData) {
                        visitorData = fresh
                        prefs.edit().putString(KEY_VISITOR, fresh).apply()
                    }
                }
                json
            }
        }

    private fun ctoken(token: String): String {
        val t = URLEncoder.encode(token, "UTF-8")
        return "&ctoken=$t&continuation=$t&type=next"
    }

    suspend fun browse(browseId: String, params: String? = null) =
        call("browse", JSONObject().put("browseId", browseId).apply { params?.let { put("params", it) } })

    suspend fun browseMore(token: String) = call("browse", JSONObject().put("continuation", token), ctoken(token))

    suspend fun search(query: String, params: String?) =
        call("search", JSONObject().put("query", query).apply { params?.let { put("params", it) } })

    suspend fun searchMore(token: String) = call("search", JSONObject().put("continuation", token), ctoken(token))

    suspend fun suggestions(input: String) = call("music/get_search_suggestions", JSONObject().put("input", input))

    /** Up next for a song (its radio) or a playlist, audio only, as the web player asks for it. */
    suspend fun next(videoId: String?, playlistId: String?, params: String? = null, continuation: String? = null): JSONObject {
        val body = JSONObject()
            .put("enablePersistentPlaylistPanel", true)
            .put("isAudioOnly", true)
            .put("tunerSettingValue", "AUTOMIX_SETTING_NORMAL")
        videoId?.let { body.put("videoId", it) }
        playlistId?.let { body.put("playlistId", it) }
        params?.let { body.put("params", it) }
        if (continuation != null) {
            body.put("continuation", continuation)
            return call("next", body, ctoken(continuation))
        }
        return call("next", body)
    }

    suspend fun like(videoId: String, like: Boolean) =
        call(if (like) "like/like" else "like/removelike", JSONObject().put("target", JSONObject().put("videoId", videoId)))

    suspend fun accountMenu() = call("account/account_menu")

    companion object {
        const val ORIGIN = "https://music.youtube.com"
        private const val API = "https://music.youtube.com/youtubei/v1/"
        const val USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0"
        private const val KEY_VISITOR = "visitor_data"
        private val JSON = "application/json".toMediaType()
    }
}
