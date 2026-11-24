package com.chinmay.swar.playback

import android.content.Context
import android.net.ConnectivityManager
import android.net.Uri
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.ResolvingDataSource
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import okhttp3.OkHttpClient
import okhttp3.RequestBody.Companion.toRequestBody
import org.schabi.newpipe.extractor.NewPipe
import org.schabi.newpipe.extractor.ServiceList
import org.schabi.newpipe.extractor.downloader.Downloader
import org.schabi.newpipe.extractor.downloader.Request
import org.schabi.newpipe.extractor.downloader.Response
import org.schabi.newpipe.extractor.exceptions.ReCaptchaException
import org.schabi.newpipe.extractor.localization.ContentCountry
import org.schabi.newpipe.extractor.localization.Localization
import org.schabi.newpipe.extractor.services.youtube.YoutubeParsingHelper
import org.schabi.newpipe.extractor.stream.AudioStream
import org.schabi.newpipe.extractor.stream.AudioTrackType
import org.schabi.newpipe.extractor.stream.DeliveryMethod
import org.schabi.newpipe.extractor.stream.StreamInfo
import java.io.File
import java.io.IOException
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

/**
 * Finds a song's audio stream with NewPipe Extractor (the engine NewPipe uses)
 * and feeds it to ExoPlayer, fetching it the way NewPipe's own player does.
 */
@OptIn(UnstableApi::class)
object Streams {
    /** What's playing, for the player's quality chip. */
    data class Resolved(
        val videoId: String,
        val url: String,
        val kbps: Int,
        val codec: String,
        val quality: AudioQuality,
        val expiresAtMs: Long,
    ) {
        val label: String get() = listOf(codec, if (kbps > 0) "$kbps kbps" else "").filter { it.isNotEmpty() }.joinToString(" · ")
    }

    private lateinit var appContext: Context
    private val resolved = ConcurrentHashMap<String, Resolved>()
    private val locks = ConcurrentHashMap<String, Any>()
    private val requestNumber = AtomicLong(0)
    private var cache: SimpleCache? = null

    private val _quality = MutableStateFlow(AudioQuality.AUTO)
    val quality: StateFlow<AudioQuality> = _quality.asStateFlow()

    private val _last = MutableStateFlow<Resolved?>(null)
    /** The stream most recently opened for playback. */
    val last: StateFlow<Resolved?> = _last.asStateFlow()

    fun init(context: Context, http: OkHttpClient) {
        appContext = context.applicationContext
        val prefs = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        _quality.value = AudioQuality.fromKey(prefs.getString(KEY_QUALITY, null))
        val country = Locale.getDefault().country.takeIf { it.length == 2 } ?: "IN"
        NewPipe.init(PipeDownloader(http), Localization("en", country), ContentCountry(country))
    }

    fun setQuality(quality: AudioQuality) {
        _quality.value = quality
        appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_QUALITY, quality.key).apply()
        resolved.clear() // the next song (and a re-opened one) uses the new choice
    }

    fun info(videoId: String): Resolved? = resolved[videoId]

    fun invalidate(videoId: String) {
        resolved.remove(videoId)
    }

    /** Blocking: call off the main thread. Cached until the stream URL expires. */
    fun resolve(videoId: String): Resolved {
        val wanted = _quality.value
        resolved[videoId]?.takeIf { it.quality == wanted && it.expiresAtMs > System.currentTimeMillis() }?.let { return it }
        synchronized(locks.getOrPut(videoId) { Any() }) {
            resolved[videoId]?.takeIf { it.quality == wanted && it.expiresAtMs > System.currentTimeMillis() }?.let { return it }
            val info = StreamInfo.getInfo(ServiceList.YouTube, "https://www.youtube.com/watch?v=$videoId")
            val audio = info.audioStreams.filter { it.isUrl && it.deliveryMethod == DeliveryMethod.PROGRESSIVE_HTTP && it.content.isNotEmpty() }
            // Dubbed tracks exist for some videos; play the original.
            val original = audio.filter { it.audioTrackType == null || it.audioTrackType == AudioTrackType.ORIGINAL }.ifEmpty { audio }
            val index = wanted.pick(original.map { AudioQuality.Candidate(kbps(it), isOpus(it)) }, metered())
            if (index < 0) throw IOException("No audio stream for this song")
            val stream = original[index]
            val url = stream.content
            val expires = Uri.parse(url).getQueryParameter("expire")?.toLongOrNull()?.let { it * 1000 - 60_000 }
                ?: (System.currentTimeMillis() + 5 * 3_600_000L)
            val r = Resolved(videoId, url, kbps(stream), if (isOpus(stream)) "Opus" else "AAC", wanted, expires)
            resolved[videoId] = r
            return r
        }
    }

    private fun kbps(s: AudioStream): Int = s.averageBitrate.takeIf { it > 0 } ?: (s.bitrate / 1000)

    private fun isOpus(s: AudioStream): Boolean =
        s.codec?.contains("opus", ignoreCase = true) == true || s.itag in OPUS_ITAGS

    private fun metered(): Boolean = runCatching {
        appContext.getSystemService(ConnectivityManager::class.java).isActiveNetworkMetered
    }.getOrDefault(true)

    /**
     * ExoPlayer's data source: each song is "swar://song/<videoId>"; when a
     * piece of it is read, the stream URL is looked up (or reused) and fetched
     * like NewPipe does (POST with a request number). Played audio is cached
     * on disk, so replays and seeking back don't download it again.
     */
    fun dataSourceFactory(context: Context): DataSource.Factory {
        val http = DefaultHttpDataSource.Factory()
            .setConnectTimeoutMs(15_000)
            .setReadTimeoutMs(20_000)
            .setKeepPostFor302Redirects(true)
            .setAllowCrossProtocolRedirects(false)
        val resolving = ResolvingDataSource.Factory(http) { spec -> streamSpec(spec) }
        return CacheDataSource.Factory()
            .setCache(cache(context))
            .setUpstreamDataSourceFactory(resolving)
            .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
    }

    private fun streamSpec(spec: DataSpec): DataSpec {
        val videoId = spec.key ?: spec.uri.lastPathSegment ?: throw IOException("Not a song")
        val r = resolve(videoId)
        _last.value = r
        val url = r.url + "&rn=" + requestNumber.incrementAndGet()
        val headers = HashMap<String, String>()
        headers["User-Agent"] = if (YoutubeParsingHelper.isVisionOsStreamingUrl(url)) {
            YoutubeParsingHelper.getVisionOsUserAgent(null)
        } else {
            DESKTOP_USER_AGENT
        }
        if (YoutubeParsingHelper.isWebStreamingUrl(url)) {
            headers["Origin"] = "https://www.youtube.com"
            headers["Referer"] = "https://www.youtube.com/"
        }
        headers["Accept-Encoding"] = "identity"
        return spec.buildUpon()
            .setUri(Uri.parse(url))
            .setHttpMethod(DataSpec.HTTP_METHOD_POST)
            .setHttpBody(POST_BODY)
            .setHttpRequestHeaders(headers)
            .build()
    }

    @Synchronized
    private fun cache(context: Context): SimpleCache = cache ?: SimpleCache(
        File(context.cacheDir, "audio"),
        LeastRecentlyUsedCacheEvictor(CACHE_BYTES),
        StandaloneDatabaseProvider(context),
    ).also { cache = it }

    fun clearCache() {
        resolved.clear()
        cache?.let { c -> c.keys.toList().forEach { runCatching { c.removeResource(it) } } }
    }

    /** NewPipe Extractor's HTTP, over OkHttp. */
    private class PipeDownloader(private val http: OkHttpClient) : Downloader() {
        override fun execute(request: Request): Response {
            val data = request.dataToSend()
            val body = when {
                data != null -> data.toRequestBody(null)
                request.httpMethod() == "POST" -> ByteArray(0).toRequestBody(null)
                else -> null
            }
            val builder = okhttp3.Request.Builder()
                .url(request.url())
                .method(request.httpMethod(), body)
                .header("User-Agent", DESKTOP_USER_AGENT)
            for ((name, values) in request.headers()) {
                builder.removeHeader(name)
                values.forEach { builder.addHeader(name, it) }
            }
            http.newCall(builder.build()).execute().use { r ->
                if (r.code == 429) throw ReCaptchaException("YouTube asked for a captcha", request.url())
                return Response(r.code, r.message, r.headers.toMultimap(), r.body?.string(), r.request.url.toString())
            }
        }
    }

    private const val PREFS = "swar"
    private const val KEY_QUALITY = "audio_quality"
    private const val CACHE_BYTES = 512L * 1024 * 1024
    private val POST_BODY = byteArrayOf(0x78, 0)
    private val OPUS_ITAGS = setOf(249, 250, 251, 774)
    const val DESKTOP_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0"
}
