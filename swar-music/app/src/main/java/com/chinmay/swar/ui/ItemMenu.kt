package com.chinmay.swar.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.PlaylistAdd
import androidx.compose.material.icons.automirrored.rounded.PlaylistPlay
import androidx.compose.material.icons.rounded.Album
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Radio
import androidx.compose.material.icons.rounded.Shuffle
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.chinmay.swar.data.Album
import com.chinmay.swar.data.Artist
import com.chinmay.swar.data.Item
import com.chinmay.swar.data.Playlist
import com.chinmay.swar.data.Song
import com.chinmay.swar.playback.SwarPlayer
import com.chinmay.swar.ui.theme.Swar

/** Long-press menu for any song, album, artist or playlist. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ItemMenu(item: Item, onDismiss: () -> Unit, beforeNavigate: () -> Unit) {
    val actions = LocalActions.current
    fun go(block: () -> Unit) { onDismiss(); block() }
    fun openPage(id: String) = go { beforeNavigate(); actions.browse(id) }

    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = Color(0xFF0C0E1A)) {
        Row(Modifier.padding(horizontal = 20.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Artwork(item.thumbnail, Modifier.size(56.dp), if (item is Artist) CircleShape else RoundedCornerShape(12.dp))
            Column(Modifier.padding(start = 14.dp)) {
                Text(item.title, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(item.subtitle, style = MaterialTheme.typography.bodySmall, color = Swar.TextDim, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        HorizontalDivider(color = Swar.Hairline, modifier = Modifier.padding(vertical = 6.dp))
        Column(Modifier.padding(bottom = 24.dp)) {
            when (item) {
                is Song -> {
                    Action(Icons.Rounded.PlayArrow, "Play now") { go { SwarPlayer.playRadio(item) } }
                    Action(Icons.AutoMirrored.Rounded.PlaylistPlay, "Play next") { go { SwarPlayer.playNext(item) } }
                    Action(Icons.AutoMirrored.Rounded.PlaylistAdd, "Add to queue") { go { SwarPlayer.addToQueue(item) } }
                    Action(Icons.Rounded.Radio, "Start radio") { go { SwarPlayer.playRadio(item) } }
                    item.album?.browseId?.let { id -> Action(Icons.Rounded.Album, "Go to album") { openPage(id) } }
                    item.artists.filter { it.browseId != null }.forEach { a ->
                        Action(Icons.Rounded.Person, "Go to ${a.name}") { openPage(a.browseId!!) }
                    }
                }
                is Album -> {
                    item.playlistId?.let { pid ->
                        Action(Icons.Rounded.PlayArrow, "Play") { go { SwarPlayer.playPlaylist(pid) } }
                        Action(Icons.Rounded.Shuffle, "Shuffle") { go { SwarPlayer.playPlaylist(pid, shuffle = true) } }
                    }
                    Action(Icons.Rounded.Album, "Open album") { openPage(item.browseId) }
                }
                is Playlist -> {
                    item.playlistId?.let { pid ->
                        Action(Icons.Rounded.PlayArrow, "Play") { go { SwarPlayer.playPlaylist(pid, params = item.params) } }
                        Action(Icons.Rounded.Shuffle, "Shuffle") { go { SwarPlayer.playPlaylist(pid, shuffle = true, params = item.params) } }
                    }
                    item.browseId?.let { id -> Action(Icons.AutoMirrored.Rounded.PlaylistPlay, "Open playlist") { openPage(id) } }
                }
                is Artist -> Action(Icons.Rounded.Person, "Open artist") { openPage(item.browseId) }
            }
        }
    }
}

@Composable
private fun Action(icon: ImageVector, label: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 22.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, tint = Swar.Cyan)
        Text(label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(start = 18.dp))
    }
}
