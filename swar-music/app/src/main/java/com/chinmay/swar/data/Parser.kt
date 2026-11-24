package com.chinmay.swar.data

import org.json.JSONArray
import org.json.JSONObject

/**
 * Turns YouTube Music (WEB_REMIX) responses into Swar's models.
 *
 * Rather than following one exact path per screen, it looks for the renderers
 * YouTube Music has used for years (shelves, carousels, list rows, cards)
 * wherever they appear, so small layout changes don't break whole screens.
 * Requests are always made in English (hl=en) so text such as "Song" and
 * "3:45" parses the same everywhere.
 */
object Parser {

    private const val TWO_ROW = "musicTwoRowItemRenderer"
    private const val LIST_ROW = "musicResponsiveListItemRenderer"
    private const val PANEL_VIDEO = "playlistPanelVideoRenderer"
    private const val PANEL_WRAPPER = "playlistPanelVideoWrapperRenderer"

    private val DURATION = Regex("""^(\d+:)*\d+:\d+$""")
    private val YEAR = Regex("""^\d{4}$""")
    private val COUNT = Regex("""^[\d.,]+[KMB]? (views|plays|subscribers|monthly audience|songs|tracks)$""", RegexOption.IGNORE_CASE)
    private val TYPES = setOf("song", "video", "single", "ep", "album", "playlist", "artist", "episode", "podcast", "profile", "station")
    private val SEPARATORS = setOf(" • ", "•", " & ", ", ", " and ", " · ")

    // ------------------------------------------------------------------ items

    /** One item from any of the list/card renderers, or null if it can't be played or opened. */
    fun item(container: JSONObject): Item? {
        container.optJSONObject(TWO_ROW)?.let { return twoRow(it) }
        container.optJSONObject(LIST_ROW)?.let { return listRow(it) }
        container.optJSONObject(PANEL_WRAPPER)?.let { return panelWrapper(it) }
        container.optJSONObject(PANEL_VIDEO)?.let { return panelVideo(it) }
        container.optJSONObject("musicNavigationButtonRenderer")?.let { return navigationButton(it) }
        return null
    }

    private fun twoRow(r: JSONObject): Item? {
        val title = text(r.opt("title"))
        val nav = r.obj("navigationEndpoint")
        val titleNav = runs(r.opt("title")).firstOrNull()?.obj("navigationEndpoint")
        val subtitleRuns = runs(r.opt("subtitle"))
        val subtitle = text(r.opt("subtitle"))
        val thumb = thumbnail(r.opt("thumbnailRenderer"))

        nav.str("watchEndpoint", "videoId")?.let { id ->
            val credits = songRuns(subtitleRuns, skipType = true)
            return Song(
                videoId = id, title = title, artists = credits.artists, album = credits.album,
                durationSec = credits.duration, thumbnail = thumb,
                videoType = videoType(nav) ?: "", extra = credits.extra,
            )
        }
        nav.str("watchPlaylistEndpoint", "playlistId")?.let { pid ->
            return Playlist(browseId = null, playlistId = pid, title = title, subtitle = subtitle, thumbnail = thumb)
        }
        val browse = nav.obj("browseEndpoint") ?: titleNav.obj("browseEndpoint") ?: return null
        val playlistInOverlay = r.str(
            "thumbnailOverlay", "musicItemThumbnailOverlayRenderer", "content", "musicPlayButtonRenderer",
            "playNavigationEndpoint", "watchPlaylistEndpoint", "playlistId",
        )
        return browseItem(browse, title, subtitle, thumb, playlistInOverlay)
    }

    private fun listRow(r: JSONObject): Item? {
        val columns = r.arr("flexColumns").objects().map {
            it.obj("musicResponsiveListItemFlexColumnRenderer", "text")
        }
        val title = text(columns.firstOrNull())
        if (title.isEmpty()) return null
        val thumb = thumbnail(r.opt("thumbnail"))
        val overlayNav = r.obj(
            "overlay", "musicItemThumbnailOverlayRenderer", "content", "musicPlayButtonRenderer", "playNavigationEndpoint",
        )
        val titleNav = runs(columns.firstOrNull()).firstOrNull()?.obj("navigationEndpoint")
        val videoId = titleNav.str("watchEndpoint", "videoId")
            ?: r.str("playlistItemData", "videoId")
            ?: overlayNav.str("watchEndpoint", "videoId")
        val browse = r.obj("navigationEndpoint", "browseEndpoint")

        if (videoId != null && browse == null) {
            val detailRuns = columns.drop(1).flatMap { runs(it) }
            val credits = songRuns(detailRuns, skipType = true)
            val fixed = r.arr("fixedColumns").objects().map {
                text(it.obj("musicResponsiveListItemFixedColumnRenderer", "text"))
            }
            val duration = credits.duration.takeIf { it > 0 } ?: fixed.firstNotNullOfOrNull { parseDuration(it) } ?: 0
            return Song(
                videoId = videoId, title = title, artists = credits.artists, album = credits.album,
                durationSec = duration, thumbnail = thumb,
                videoType = videoType(overlayNav) ?: videoType(titleNav) ?: "",
                explicit = r.has("badges"), extra = credits.extra,
            )
        }
        if (browse == null) {
            // A mix or radio row: plays a playlist, has no page.
            val pid = overlayNav.str("watchPlaylistEndpoint", "playlistId") ?: return null
            return Playlist(null, pid, title, columns.drop(1).joinToString(" • ") { text(it) }.trim(' ', '•'), thumb)
        }
        val subtitle = columns.drop(1).map { text(it) }.filter { it.isNotBlank() }.joinToString(" • ")
        return browseItem(browse, title, subtitle, thumb, overlayNav.str("watchPlaylistEndpoint", "playlistId"))
    }

    private fun browseItem(browse: JSONObject, title: String, subtitle: String, thumb: String, playlistId: String?): Item? {
        val id = browse.str("browseId") ?: return null
        return when (pageType(browse)) {
            "MUSIC_PAGE_TYPE_ALBUM", "MUSIC_PAGE_TYPE_AUDIOBOOK" -> Album(id, title, subtitle, thumb, playlistId)
            "MUSIC_PAGE_TYPE_ARTIST", "MUSIC_PAGE_TYPE_USER_CHANNEL", "MUSIC_PAGE_TYPE_LIBRARY_ARTIST" ->
                Artist(id, title, subtitle, thumb)
            "MUSIC_PAGE_TYPE_PLAYLIST" -> Playlist(id, playlistId ?: id.removePrefix("VL"), title, subtitle, thumb)
            else -> Playlist(id, null, title, subtitle, thumb, params = browse.str("params"))
        }
    }

    /** Moods & genres tiles. */
    private fun navigationButton(r: JSONObject): Item? {
        val browse = r.obj("clickCommand", "browseEndpoint") ?: return null
        val id = browse.str("browseId") ?: return null
        return Playlist(id, null, text(r.opt("buttonText")), "", "", params = browse.str("params"))
    }

    private fun panelWrapper(w: JSONObject): Song? {
        val primary = w.obj("primaryRenderer", PANEL_VIDEO)?.let { panelVideo(it) }
        val counterpart = w.arr("counterpart").objects().firstNotNullOfOrNull {
            it.obj("counterpartRenderer", PANEL_VIDEO)?.let { c -> panelVideo(c) }
        }
        if (primary == null) return counterpart
        if (counterpart == null) return primary
        // Keep the song at the front: a video carries its song version, a song is played as is.
        return when {
            primary.isVideo && !counterpart.isVideo -> primary.copy(songVersion = counterpart)
            counterpart.isVideo && !primary.isVideo -> primary
            else -> primary
        }
    }

    fun panelVideo(r: JSONObject): Song? {
        if (r.has("unplayableText")) return null
        val id = r.str("videoId") ?: r.str("navigationEndpoint", "watchEndpoint", "videoId") ?: return null
        val credits = songRuns(runs(r.opt("longBylineText")), skipType = false)
        return Song(
            videoId = id,
            title = text(r.opt("title")),
            artists = credits.artists,
            album = credits.album,
            durationSec = parseDuration(text(r.opt("lengthText"))) ?: credits.duration,
            thumbnail = thumbnail(r.opt("thumbnail")),
            videoType = videoType(r.obj("navigationEndpoint")) ?: "",
        )
    }

    private fun pageType(browse: JSONObject?): String? = browse.str(
        "browseEndpointContextSupportedConfigs", "browseEndpointContextMusicConfig", "pageType",
    )

    private fun videoType(nav: JSONObject?): String? = nav.str(
        "watchEndpoint", "watchEndpointMusicSupportedConfigs", "watchEndpointMusicConfig", "musicVideoType",
    )

    // ---------------------------------------------------------------- credits

    data class Credits(val artists: List<Ref>, val album: Ref?, val duration: Int, val extra: String)

    /**
     * "Song • Artist & Artist • Album • 3:45" style runs, split into groups at
     * each " • ". The first group is the type (skipped when [skipType]) or the
     * artists; a group linking to an album page is the album; times, years and
     * play counts are recognised by their shape.
     */
    fun songRuns(list: List<JSONObject>, skipType: Boolean): Credits {
        val groups = mutableListOf(mutableListOf<JSONObject>())
        for (run in list) {
            if (run.optString("text").trim() == "•") groups += mutableListOf<JSONObject>() else groups.last() += run
        }
        val artists = mutableListOf<Ref>()
        var album: Ref? = null
        var duration = 0
        var extra = ""
        groups.removeAll { g -> g.all { it.optString("text").isBlank() } }
        groups.forEachIndexed { i, group ->
            val joined = group.joinToString("") { it.optString("text") }.trim()
            val albumRun = group.firstOrNull { pageType(it.obj("navigationEndpoint", "browseEndpoint")) == "MUSIC_PAGE_TYPE_ALBUM" }
            when {
                albumRun != null -> album = Ref(albumRun.optString("text"), albumRun.str("navigationEndpoint", "browseEndpoint", "browseId"))
                DURATION.matches(joined) -> duration = parseDuration(joined) ?: 0
                COUNT.matches(joined) -> extra = joined
                YEAR.matches(joined) -> Unit
                i == 0 && skipType && joined.lowercase() in TYPES && group.none { it.has("navigationEndpoint") } -> Unit
                artists.isEmpty() -> group.forEach { run ->
                    val t = run.optString("text")
                    if (t.isBlank() || t in SEPARATORS || t.trim() in SEPARATORS) return@forEach
                    artists += Ref(t.trim(), run.str("navigationEndpoint", "browseEndpoint", "browseId"))
                }
                album == null && group.none { it.has("navigationEndpoint") } -> album = Ref(joined)
            }
        }
        return Credits(artists, album, duration, extra)
    }

    fun parseDuration(s: String): Int? {
        val t = s.trim()
        if (!DURATION.matches(t)) return null
        return t.split(':').fold(0) { acc, part -> acc * 60 + (part.toIntOrNull() ?: 0) }
    }

    // --------------------------------------------------------------- sections

    /** Every shelf and carousel in a browse or search response, in page order. */
    fun sections(root: Any?): List<Section> {
        val out = mutableListOf<Section>()
        walk(root) { key, o ->
            when (key) {
                "musicCarouselShelfRenderer", "musicImmersiveCarouselShelfRenderer" -> {
                    val header = o.obj("header", "musicCarouselShelfBasicHeaderRenderer")
                        ?: o.obj("header", "musicImmersiveCarouselShelfBasicHeaderRenderer")
                    val title = text(header?.opt("title")).ifEmpty { text(header?.opt("strapline")) }
                    val items = items(o.arr("contents"))
                    val more = header.obj("moreContentButton", "buttonRenderer", "navigationEndpoint", "browseEndpoint")
                        ?.let { b -> b.str("browseId")?.let { BrowseTarget(it, b.str("params")) } }
                    val allSongs = items.isNotEmpty() && items.all { it is Song }
                    val listRows = o.arr("contents").objects().any { it.has(LIST_ROW) }
                    if (items.isNotEmpty()) {
                        out += Section(
                            title, items, if (allSongs && listRows) Layout.GRID else Layout.CAROUSEL, more,
                            subtitle = text(header?.opt("strapline")).takeIf { it != title }.orEmpty(),
                        )
                    }
                    false
                }
                "musicShelfRenderer", "musicPlaylistShelfRenderer" -> {
                    val items = items(o.arr("contents"))
                    val more = o.obj("bottomEndpoint", "browseEndpoint")
                        ?.let { b -> b.str("browseId")?.let { BrowseTarget(it, b.str("params")) } }
                    if (items.isNotEmpty()) {
                        out += Section(text(o.opt("title")), items, Layout.LIST, more, continuation(o))
                    }
                    false
                }
                "gridRenderer" -> {
                    val items = items(o.arr("items"))
                    val title = text(o.obj("header", "gridHeaderRenderer")?.opt("title"))
                    if (items.isNotEmpty()) out += Section(title, items, Layout.GRID, null, continuation(o))
                    false
                }
                "musicCardShelfRenderer" -> {
                    cardShelf(o)?.let { out += it }
                    false
                }
                "header", "frameworkUpdates", "responseContext", "menu" -> false
                else -> true
            }
        }
        return out
    }

    /** Search's "Top result" card, followed by the few items it shows under it. */
    private fun cardShelf(o: JSONObject): Section? {
        val titleRun = runs(o.opt("title")).firstOrNull()
        val nav = titleRun?.obj("navigationEndpoint") ?: o.obj("onTap")
        val thumb = thumbnail(o.opt("thumbnail"))
        val title = text(o.opt("title"))
        val top: Item? = when {
            nav.str("watchEndpoint", "videoId") != null -> {
                val credits = songRuns(runs(o.opt("subtitle")), skipType = true)
                Song(
                    videoId = nav.str("watchEndpoint", "videoId")!!, title = title,
                    artists = credits.artists, album = credits.album, durationSec = credits.duration,
                    thumbnail = thumb, videoType = videoType(nav) ?: "",
                )
            }
            nav.obj("browseEndpoint") != null -> browseItem(nav.obj("browseEndpoint")!!, title, text(o.opt("subtitle")), thumb, null)
            else -> null
        }
        val rest = items(o.arr("contents"))
        val all = listOfNotNull(top) + rest
        if (all.isEmpty()) return null
        val header = text(o.obj("header", "musicCardShelfHeaderBasicRenderer")?.opt("title")).ifEmpty { "Top result" }
        return Section(header, all, Layout.LIST)
    }

    fun items(list: JSONArray?): List<Item> = list.objects().mapNotNull { item(it) }

    // ----------------------------------------------------------- continuations

    /** The "load more" token of a shelf, section list or queue, old style or new. */
    fun continuation(o: JSONObject?): String? {
        if (o == null) return null
        o.arr("continuations").objects().firstOrNull()?.let { c ->
            (c.str("nextContinuationData", "continuation")
                ?: c.str("nextRadioContinuationData", "continuation")
                ?: c.str("reloadContinuationData", "continuation"))?.let { return it }
        }
        for (key in listOf("contents", "items", "continuationItems")) {
            val last = o.arr(key).objects().lastOrNull() ?: continue
            last.str("continuationItemRenderer", "continuationEndpoint", "continuationCommand", "token")?.let { return it }
        }
        return null
    }

    /** A browse page: header, sections, Home's chips and the next-sections token. */
    fun page(root: JSONObject): Page {
        val sectionList = find(root.opt("contents"), "sectionListRenderer")
        return Page(
            header = header(root),
            sections = sections(root.opt("contents")),
            continuation = continuation(sectionList),
            chips = chips(sectionList),
        )
    }

    private fun chips(sectionList: JSONObject?): List<Chip> =
        sectionList.obj("header", "chipCloudRenderer").arr("chips").objects().mapNotNull { c ->
            val chip = c.obj("chipCloudChipRenderer") ?: return@mapNotNull null
            val title = text(chip.opt("text")).ifEmpty { return@mapNotNull null }
            Chip(title, chip.str("navigationEndpoint", "browseEndpoint", "params"), chip.optBoolean("isSelected"))
        }

    /** The answer to a continuation request of any kind. */
    fun continued(root: JSONObject): Continued {
        val cc = root.obj("continuationContents")
        if (cc != null) {
            cc.obj("sectionListContinuation")?.let { return Continued(sections = sections(it), continuation = continuation(it)) }
            for (key in listOf("musicShelfContinuation", "musicPlaylistShelfContinuation", "gridContinuation", "playlistPanelContinuation")) {
                cc.obj(key)?.let { s ->
                    return Continued(items = items(s.arr("contents") ?: s.arr("items")), continuation = continuation(s))
                }
            }
        }
        val append = root.arr("onResponseReceivedActions").objects().firstNotNullOfOrNull {
            it.obj("appendContinuationItemsAction")
        }
        if (append != null) {
            val list = append.arr("continuationItems")
            val sections = sections(list)
            return Continued(sections = sections, items = if (sections.isEmpty()) items(list) else emptyList(), continuation = continuation(append))
        }
        return Continued()
    }

    // ------------------------------------------------------------------ header

    fun header(root: JSONObject): Header? {
        val h = find(root, "musicResponsiveHeaderRenderer")
            ?: find(root.opt("header"), "musicImmersiveHeaderRenderer")
            ?: find(root.opt("header"), "musicVisualHeaderRenderer")
            ?: find(root.opt("header"), "musicDetailHeaderRenderer")
            ?: find(root.opt("header"), "musicEditablePlaylistDetailHeaderRenderer")
            ?: return null
        val isArtist = root.obj("header")?.let { it.has("musicImmersiveHeaderRenderer") || it.has("musicVisualHeaderRenderer") } == true
        val description = text(h.opt("description")).ifEmpty {
            text(h.obj("description", "musicDescriptionShelfRenderer")?.opt("description"))
        }
        val radio = h.str("startRadioButton", "buttonRenderer", "navigationEndpoint", "watchPlaylistEndpoint", "playlistId")
            ?: h.str("startRadioButton", "buttonRenderer", "navigationEndpoint", "watchEndpoint", "playlistId")
        val shuffle = h.str("playButton", "buttonRenderer", "navigationEndpoint", "watchEndpoint", "playlistId")
            ?: h.str("playButton", "buttonRenderer", "navigationEndpoint", "watchPlaylistEndpoint", "playlistId")
        return Header(
            title = text(h.opt("title")),
            subtitle = text(h.opt("subtitle")),
            strapline = text(h.opt("straplineTextOne")),
            secondSubtitle = text(h.opt("secondSubtitle")),
            description = description,
            thumbnail = thumbnail(h.opt("thumbnail") ?: h.opt("foregroundThumbnail")),
            radioPlaylistId = radio,
            shufflePlaylistId = shuffle,
            isArtist = isArtist,
        )
    }

    // ------------------------------------------------------------------- queue

    /** Up next from /next, or from a /next continuation. */
    fun queue(root: JSONObject, videoId: String? = null): Queue {
        val panel = find(root.opt("contents"), "playlistPanelRenderer")
            ?: root.obj("continuationContents", "playlistPanelContinuation")
        val songs = panel.arr("contents").objects().mapNotNull { item(it) as? Song }
        return Queue(
            songs = songs,
            playlistId = panel.str("playlistId"),
            continuation = continuation(panel),
            liked = videoId?.let { likeStatus(root, it) },
        )
    }

    private fun likeStatus(root: JSONObject, videoId: String): Boolean? {
        var status: String? = null
        walk(root) { _, o ->
            if (status != null) return@walk false
            val like = o.optJSONObject("likeButtonRenderer")
            if (like != null && (like.str("target", "videoId") == null || like.str("target", "videoId") == videoId)) {
                status = like.str("likeStatus")
                return@walk false
            }
            true
        }
        return status?.let { it == "LIKE" }
    }

    // -------------------------------------------------------------- the rest

    fun suggestions(root: JSONObject): List<String> {
        val out = mutableListOf<String>()
        walk(root) { k, o ->
            if (k == "searchSuggestionRenderer") {
                text(o.opt("suggestion")).takeIf { it.isNotBlank() }?.let { out += it }
                false
            } else {
                true
            }
        }
        return out.distinct()
    }

    fun accountInfo(root: JSONObject): AccountInfo? {
        val h = find(root, "activeAccountHeaderRenderer") ?: return null
        val name = text(h.opt("accountName")).ifEmpty { return null }
        return AccountInfo(name, text(h.opt("channelHandle")), thumbnail(h.opt("accountPhoto")))
    }
}
