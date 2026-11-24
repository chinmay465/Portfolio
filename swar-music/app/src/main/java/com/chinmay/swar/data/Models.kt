package com.chinmay.swar.data

/** A name that may open a page: an artist or album credit on a song. */
data class Ref(val name: String, val browseId: String? = null)

/** Anything YouTube Music lists: songs, albums, artists, playlists and mixes. */
sealed interface Item {
    val title: String
    val subtitle: String
    val thumbnail: String
}

data class Song(
    val videoId: String,
    override val title: String,
    val artists: List<Ref> = emptyList(),
    val album: Ref? = null,
    val durationSec: Int = 0,
    override val thumbnail: String = "",
    /** MUSIC_VIDEO_TYPE_ATV for songs; OMV/UGC for music videos and uploads. */
    val videoType: String = "",
    val explicit: Boolean = false,
    /** For a music video: the song version YouTube Music links to it, if any. */
    val songVersion: Song? = null,
    /** Extra text for list rows, e.g. "1.2M plays". */
    val extra: String = "",
) : Item {
    val artistText: String get() = artists.joinToString(", ") { it.name }
    override val subtitle: String
        get() = listOf(artistText, album?.name.orEmpty()).filter { it.isNotBlank() }.joinToString(" • ")
    val isVideo: Boolean get() = videoType == OMV || videoType == UGC

    /** What Swar actually plays: the song version of a music video when there is one. */
    val playable: Song get() = songVersion?.takeIf { isVideo } ?: this

    companion object {
        const val ATV = "MUSIC_VIDEO_TYPE_ATV"
        const val OMV = "MUSIC_VIDEO_TYPE_OMV"
        const val UGC = "MUSIC_VIDEO_TYPE_UGC"
    }
}

data class Album(
    val browseId: String,
    override val title: String,
    override val subtitle: String = "",
    override val thumbnail: String = "",
    /** Its audio playlist (OLAK5uy_…), for playing it straight from a card. */
    val playlistId: String? = null,
) : Item

data class Artist(
    val browseId: String,
    override val title: String,
    override val subtitle: String = "",
    override val thumbnail: String = "",
) : Item

/**
 * A playlist page (browseId VL…), a mix or radio that only plays
 * (playlistId, no page), or another page such as a mood or chart.
 */
data class Playlist(
    val browseId: String?,
    val playlistId: String?,
    override val title: String,
    override val subtitle: String = "",
    override val thumbnail: String = "",
    val params: String? = null,
) : Item {
    /** Mixes and radios open straight into the player. */
    val playsDirectly: Boolean get() = browseId == null && playlistId != null
}

enum class Layout { LIST, CAROUSEL, GRID }

data class Section(
    val title: String,
    val items: List<Item>,
    val layout: Layout,
    /** "More" / "Show all" page. */
    val more: BrowseTarget? = null,
    /** Next items of this shelf (long playlists). */
    val continuation: String? = null,
    val subtitle: String = "",
)

data class BrowseTarget(val browseId: String, val params: String? = null)

data class Header(
    val title: String,
    val subtitle: String = "",
    val strapline: String = "",
    val secondSubtitle: String = "",
    val description: String = "",
    val thumbnail: String = "",
    /** A radio or shuffle playlist offered by the page (artist pages). */
    val radioPlaylistId: String? = null,
    val shufflePlaylistId: String? = null,
    val isArtist: Boolean = false,
)

/** A filter chip at the top of Home ("Relax", "Workout"…). */
data class Chip(val title: String, val params: String?, val selected: Boolean = false)

data class Page(
    val header: Header? = null,
    val sections: List<Section> = emptyList(),
    /** More sections (Home, search "All"). */
    val continuation: String? = null,
    val chips: List<Chip> = emptyList(),
)

/** What a continuation request brought back. */
data class Continued(
    val sections: List<Section> = emptyList(),
    val items: List<Item> = emptyList(),
    val continuation: String? = null,
)

/** Up next, from YouTube Music's watch-next endpoint. */
data class Queue(
    val songs: List<Song>,
    val playlistId: String? = null,
    val continuation: String? = null,
    /** Like status of the requested song, when signed in. */
    val liked: Boolean? = null,
)

data class AccountInfo(val name: String, val handle: String = "", val photo: String = "")
