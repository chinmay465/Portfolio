package com.chinmay.swar.data

import android.content.Context
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

/** Search filters, with the same request params YouTube Music's own chips send. */
enum class SearchFilter(val label: String, val params: String?) {
    ALL("All", null),
    SONGS("Songs", "EgWKAQIIAWoMEA4QChADEAQQCRAF"),
    VIDEOS("Videos", "EgWKAQIQAWoMEA4QChADEAQQCRAF"),
    ALBUMS("Albums", "EgWKAQIYAWoMEA4QChADEAQQCRAF"),
    ARTISTS("Artists", "EgWKAQIgAWoMEA4QChADEAQQCRAF"),
    PLAYLISTS("Playlists", "EgeKAQQoADgBagwQDhAKEAMQBBAJEAU%3D"),
}

/** Library shelves (signed in). */
enum class LibraryShelf(val label: String, val browseId: String) {
    LIKED("Liked songs", "VLLM"),
    PLAYLISTS("Playlists", "FEmusic_liked_playlists"),
    ALBUMS("Albums", "FEmusic_liked_albums"),
    ARTISTS("Artists", "FEmusic_library_corpus_track_artists"),
    HISTORY("History", "FEmusic_history"),
}

/** Everything Swar asks YouTube Music for. */
object YtMusic {
    lateinit var http: OkHttpClient
        private set
    lateinit var account: Account
        private set
    private lateinit var api: InnerTube

    fun init(context: Context) {
        http = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .build()
        account = Account(context)
        api = InnerTube(context, http, account)
    }

    suspend fun home(params: String? = null): Page = Parser.page(api.browse("FEmusic_home", params))

    suspend fun explore(): Page = Parser.page(api.browse("FEmusic_explore"))

    suspend fun browse(browseId: String, params: String? = null): Page =
        withAlbumCredits(browseId, Parser.page(api.browse(browseId, params)))

    suspend fun browseMore(token: String): Continued = Parser.continued(api.browseMore(token))

    suspend fun search(query: String, filter: SearchFilter): Page = Parser.page(api.search(query, filter.params))

    suspend fun searchMore(token: String): Continued = Parser.continued(api.searchMore(token))

    suspend fun suggestions(input: String): List<String> = Parser.suggestions(api.suggestions(input))

    /** A song's radio: the song first, then what YouTube Music would play after it. */
    suspend fun radio(videoId: String): Queue = Parser.queue(api.next(videoId, "RDAMVM$videoId"), videoId)

    /** A playlist or mix played from the start (or from [videoId] in it). */
    suspend fun playlistQueue(playlistId: String, videoId: String? = null, params: String? = null): Queue =
        Parser.queue(api.next(videoId, playlistId, params), videoId)

    suspend fun queueMore(playlistId: String?, token: String): Queue {
        val more = Parser.queue(api.next(null, playlistId, continuation = token))
        if (more.songs.isNotEmpty()) return more
        val c = Parser.continued(api.next(null, playlistId, continuation = token))
        return Queue(c.items.filterIsInstance<Song>(), playlistId, c.continuation)
    }

    suspend fun likeStatus(videoId: String): Boolean? = Parser.queue(api.next(videoId, null), videoId).liked

    suspend fun like(videoId: String, like: Boolean) {
        api.like(videoId, like)
    }

    suspend fun accountInfo(): AccountInfo? = Parser.accountInfo(api.accountMenu())

    /** Album track rows carry no cover or artist of their own: take them from the album. */
    private fun withAlbumCredits(browseId: String, page: Page): Page {
        val header = page.header ?: return page
        if (!browseId.startsWith("MPRE")) return page
        val albumRef = Ref(header.title, browseId)
        val artist = header.strapline.takeIf { it.isNotBlank() }?.let { listOf(Ref(it)) }.orEmpty()
        return page.copy(sections = page.sections.map { section ->
            section.copy(items = section.items.map { item ->
                if (item !is Song) item else item.copy(
                    thumbnail = item.thumbnail.ifEmpty { header.thumbnail },
                    artists = item.artists.ifEmpty { artist },
                    album = item.album ?: albumRef,
                )
            })
        })
    }
}
