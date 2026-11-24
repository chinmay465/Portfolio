package com.chinmay.swar.ui

import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.navigation.NavHostController
import com.chinmay.swar.data.Album
import com.chinmay.swar.data.Artist
import com.chinmay.swar.data.Item
import com.chinmay.swar.data.Playlist
import com.chinmay.swar.data.Song
import com.chinmay.swar.playback.SwarPlayer

object Routes {
    const val HOME = "home"
    const val SEARCH = "search"
    const val LIBRARY = "library"
    const val SETTINGS = "settings"
    const val BROWSE = "browse?id={id}&params={params}"

    fun browse(id: String, params: String? = null): String =
        "browse?id=${Uri.encode(id)}" + (params?.let { "&params=${Uri.encode(it)}" } ?: "")
}

/** What tapping things does, shared by every screen. */
class Actions(private val nav: NavHostController, private val showPlayer: () -> Unit) {
    /** The item whose long-press menu is open. */
    var menuFor by mutableStateOf<Item?>(null)

    fun browse(id: String, params: String? = null) {
        nav.navigate(Routes.browse(id, params)) { launchSingleTop = true }
    }

    fun open(item: Item) {
        when (item) {
            is Song -> SwarPlayer.playRadio(item)
            is Album -> browse(item.browseId)
            is Artist -> browse(item.browseId)
            is Playlist -> when {
                item.playsDirectly -> SwarPlayer.playPlaylist(item.playlistId!!, params = item.params)
                item.browseId != null -> browse(item.browseId, item.params)
            }
        }
    }

    /** A song in an album or playlist: play that list from it. */
    fun playFrom(list: List<Song>, index: Int, continuation: String? = null) {
        SwarPlayer.play(list, index, continuation = continuation)
    }

    fun expandPlayer() = showPlayer()
}

val LocalActions = staticCompositionLocalOf<Actions> { error("Actions not provided") }
