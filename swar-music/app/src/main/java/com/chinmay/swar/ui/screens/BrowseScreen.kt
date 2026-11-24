package com.chinmay.swar.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Radio
import androidx.compose.material.icons.rounded.Shuffle
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.chinmay.swar.data.Header
import com.chinmay.swar.data.Layout
import com.chinmay.swar.data.Song
import com.chinmay.swar.playback.SwarPlayer
import com.chinmay.swar.ui.Artwork
import com.chinmay.swar.ui.ErrorState
import com.chinmay.swar.ui.GradientButton
import com.chinmay.swar.ui.ListRowItem
import com.chinmay.swar.ui.Loading
import com.chinmay.swar.ui.LocalActions
import com.chinmay.swar.ui.SongRow
import com.chinmay.swar.ui.section
import com.chinmay.swar.ui.theme.Swar

/** Album, playlist, artist, mood or any other YouTube Music page. */
@Composable
fun BrowseScreen(browseId: String, params: String?, bottomPadding: PaddingValues, onBack: () -> Unit) {
    val model: BrowseModel = viewModel(key = "$browseId|$params") { BrowseModel(browseId, params) }
    val actions = LocalActions.current
    val isAlbum = browseId.startsWith("MPRE")

    Box(Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = bottomPadding) {
            when (val p = model.page) {
                is Load.Loading -> item { Spacer(Modifier.windowInsetsPadding(WindowInsets.statusBars).height(56.dp)); Loading() }
                is Load.Failed -> item { Spacer(Modifier.windowInsetsPadding(WindowInsets.statusBars).height(56.dp)); ErrorState(p.message, { model.load() }) }
                is Load.Ready -> {
                    val page = p.value
                    val header = page.header
                    item(key = "header") {
                        if (header == null) Spacer(Modifier.windowInsetsPadding(WindowInsets.statusBars).height(56.dp))
                        else if (header.isArtist) ArtistHeader(header) else CoverHeader(header, round = false)
                    }
                    item(key = "buttons") { PlayButtons(model, header) }
                    val songs = model.songs()
                    val lastList = page.sections.indexOfLast { it.layout == Layout.LIST }
                    page.sections.forEachIndexed { i, s ->
                        section(
                            s, "s$i", actions,
                            numbered = isAlbum, showArt = !isAlbum,
                            allSongs = if (s.layout == Layout.LIST && !(header?.isArtist ?: false)) songs else null,
                            continuation = model.shelfContinuation,
                        )
                        if (i == lastList) {
                            model.moreItems.forEachIndexed { j, it ->
                                item(key = "x$j") {
                                    if (it is Song) SongRow(it, onClick = { actions.playFrom(songs, songs.indexOf(it), model.shelfContinuation) }, showArt = !isAlbum)
                                    else ListRowItem(it)
                                }
                            }
                        }
                    }
                    model.more.forEachIndexed { i, s -> section(s, "m$i", actions) }
                    if (header?.description?.isNotBlank() == true) item(key = "about") { About(header.description) }
                    if (model.canLoadMore) item(key = "more-${model.moreItems.size}-${model.more.size}") {
                        LaunchedEffect(Unit) { model.loadMore() }
                        Loading()
                    }
                }
            }
        }
        IconButton(
            onClick = onBack,
            modifier = Modifier.windowInsetsPadding(WindowInsets.statusBars).padding(8.dp)
                .background(Color(0x66000000), CircleShape),
        ) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back", tint = Swar.Text) }
    }
}

@Composable
private fun CoverHeader(h: Header, round: Boolean) {
    Column(
        Modifier.fillMaxWidth().windowInsetsPadding(WindowInsets.statusBars).padding(top = 52.dp, start = 24.dp, end = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Artwork(
            h.thumbnail,
            Modifier.size(232.dp).shadow(28.dp, RoundedCornerShape(22.dp), ambientColor = Swar.Blue, spotColor = Swar.Violet),
            if (round) CircleShape else RoundedCornerShape(22.dp),
        )
        Spacer(Modifier.height(20.dp))
        Text(h.title, style = MaterialTheme.typography.headlineMedium, textAlign = TextAlign.Center, maxLines = 3, overflow = TextOverflow.Ellipsis)
        if (h.strapline.isNotBlank()) {
            Text(h.strapline, style = MaterialTheme.typography.titleMedium, color = Swar.Cyan, modifier = Modifier.padding(top = 4.dp))
        }
        val meta = listOf(h.subtitle, h.secondSubtitle).filter { it.isNotBlank() }.joinToString(" • ")
        if (meta.isNotBlank()) {
            Text(meta, style = MaterialTheme.typography.bodyMedium, color = Swar.TextDim, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 4.dp))
        }
    }
}

@Composable
private fun ArtistHeader(h: Header) {
    Box(Modifier.fillMaxWidth().aspectRatio(1.05f)) {
        Artwork(h.thumbnail, Modifier.fillMaxSize(), RoundedCornerShape(0.dp))
        Box(
            Modifier.fillMaxSize().background(
                Brush.verticalGradient(0f to Color.Transparent, 0.55f to Color(0x3305060B), 1f to Swar.Space),
            ),
        )
        Column(Modifier.align(Alignment.BottomStart).padding(20.dp)) {
            Text(h.title, style = MaterialTheme.typography.headlineLarge)
            if (h.subtitle.isNotBlank()) Text(h.subtitle, style = MaterialTheme.typography.bodyMedium, color = Swar.TextDim)
        }
    }
}

@Composable
private fun PlayButtons(model: BrowseModel, header: Header?) {
    val songs = model.songs()
    val artist = header?.isArtist == true
    if (songs.isEmpty() && header?.shufflePlaylistId == null && header?.radioPlaylistId == null) return
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        GradientButton(
            if (artist) "Shuffle" else "Play",
            onClick = {
                when {
                    artist && header?.shufflePlaylistId != null -> SwarPlayer.playPlaylist(header.shufflePlaylistId, shuffle = true)
                    songs.isNotEmpty() -> SwarPlayer.play(songs, 0, shuffle = artist, continuation = model.shelfContinuation)
                }
            },
            icon = { Icon(if (artist) Icons.Rounded.Shuffle else Icons.Rounded.PlayArrow, null, tint = Swar.Text) },
        )
        if (!artist && songs.size > 1) {
            OutlinedButton(onClick = { SwarPlayer.play(songs, 0, shuffle = true, continuation = model.shelfContinuation) }) {
                Icon(Icons.Rounded.Shuffle, null, tint = Swar.Cyan)
                Spacer(Modifier.size(6.dp))
                Text("Shuffle", color = Swar.Text)
            }
        }
        header?.radioPlaylistId?.let { radio ->
            OutlinedButton(onClick = { SwarPlayer.playPlaylist(radio) }) {
                Icon(Icons.Rounded.Radio, null, tint = Swar.Cyan)
                Spacer(Modifier.size(6.dp))
                Text("Radio", color = Swar.Text)
            }
        }
    }
}

@Composable
private fun About(text: String) {
    Column(Modifier.padding(20.dp)) {
        Text("About", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(8.dp))
        Text(text, style = MaterialTheme.typography.bodyMedium, color = Swar.TextDim, maxLines = 8, overflow = TextOverflow.Ellipsis)
    }
}
