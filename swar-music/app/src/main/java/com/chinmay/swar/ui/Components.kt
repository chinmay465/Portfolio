package com.chinmay.swar.ui

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyHorizontalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Explicit
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.chinmay.swar.data.Artist
import com.chinmay.swar.data.Item
import com.chinmay.swar.data.Layout
import com.chinmay.swar.data.Section
import com.chinmay.swar.data.Song
import com.chinmay.swar.playback.SwarPlayer
import com.chinmay.swar.ui.theme.Swar

// ------------------------------------------------------------------ artwork

@Composable
fun Artwork(url: String, modifier: Modifier = Modifier, shape: Shape = RoundedCornerShape(12.dp)) {
    Box(
        modifier
            .clip(shape)
            .background(Brush.linearGradient(listOf(Swar.Blue.copy(alpha = 0.35f), Swar.Violet.copy(alpha = 0.25f)))),
        contentAlignment = Alignment.Center,
    ) {
        if (url.isEmpty()) {
            Icon(Icons.Rounded.MusicNote, null, tint = Swar.TextDim)
        } else {
            AsyncImage(model = url, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        }
    }
}

// --------------------------------------------------------------------- rows

fun durationText(sec: Int): String = if (sec <= 0) "" else if (sec >= 3600) {
    "%d:%02d:%02d".format(sec / 3600, sec % 3600 / 60, sec % 60)
} else {
    "%d:%02d".format(sec / 60, sec % 60)
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun SongRow(
    song: Song,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    number: Int? = null,
    showArt: Boolean = true,
) {
    val actions = LocalActions.current
    val currentId by SwarPlayer.currentId.collectAsState()
    val isCurrent = currentId == song.playable.videoId
    Row(
        modifier
            .fillMaxWidth()
            .combinedClickable(onClick = onClick, onLongClick = { actions.menuFor = song })
            .padding(horizontal = 16.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (showArt) {
            Box {
                Artwork(song.thumbnail, Modifier.size(52.dp), RoundedCornerShape(10.dp))
                if (isCurrent) PlayingBars(Modifier.align(Alignment.Center).size(22.dp))
            }
        } else {
            Box(Modifier.width(32.dp), contentAlignment = Alignment.Center) {
                if (isCurrent) PlayingBars(Modifier.size(18.dp))
                else Text(number?.toString().orEmpty(), color = Swar.TextFaint, style = MaterialTheme.typography.labelLarge)
            }
        }
        Column(Modifier.weight(1f).padding(start = 14.dp)) {
            Text(
                song.title, maxLines = 1, overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.titleSmall, color = if (isCurrent) Swar.Cyan else Swar.Text,
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (song.explicit) Icon(Icons.Rounded.Explicit, null, Modifier.size(14.dp).padding(end = 3.dp), tint = Swar.TextFaint)
                val detail = listOf(song.subtitle, song.extra, durationText(song.durationSec).takeIf { !showArt }.orEmpty())
                    .filter { it.isNotBlank() }.joinToString(" • ")
                Text(detail, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyMedium, color = Swar.TextDim)
            }
        }
        IconButton(onClick = { actions.menuFor = song }) {
            Icon(Icons.Rounded.MoreVert, "More", tint = Swar.TextDim)
        }
    }
}

/** Little level-meter bars over the playing song. */
@Composable
fun PlayingBars(modifier: Modifier = Modifier, animate: Boolean = true, always: Boolean = false) {
    val playing by SwarPlayer.isPlaying.collectAsState()
    val t = rememberInfiniteTransition(label = "bars")
    val phases = (0 until 3).map { i ->
        t.animateFloat(
            0.3f, 1f,
            infiniteRepeatable(tween(420 + i * 130), RepeatMode.Reverse), label = "bar$i",
        )
    }
    Box(
        modifier.drawBehind {
            val n = 3
            val gap = size.width * 0.14f
            val w = (size.width - gap * (n - 1)) / n
            for (i in 0 until n) {
                val level = if (animate && (always || playing)) phases[i].value else 0.45f
                val h = size.height * level
                drawRoundRect(
                    Swar.AccentHorizontal,
                    topLeft = Offset(i * (w + gap), size.height - h),
                    size = Size(w, h),
                    cornerRadius = CornerRadius(w / 2),
                )
            }
        },
    )
}

// -------------------------------------------------------------------- cards

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ItemCard(item: Item, modifier: Modifier = Modifier, width: Dp = 150.dp) {
    val actions = LocalActions.current
    val round = item is Artist
    Column(
        modifier
            .width(width)
            .clip(RoundedCornerShape(16.dp))
            .combinedClickable(onClick = { actions.open(item) }, onLongClick = { actions.menuFor = item })
            .padding(6.dp),
    ) {
        Artwork(
            item.thumbnail,
            Modifier.size(width - 12.dp),
            if (round) CircleShape else RoundedCornerShape(14.dp),
        )
        Spacer(Modifier.height(8.dp))
        Text(
            item.title, maxLines = 2, overflow = TextOverflow.Ellipsis,
            style = MaterialTheme.typography.titleSmall, color = Swar.Text,
            modifier = if (round) Modifier.align(Alignment.CenterHorizontally) else Modifier,
        )
        if (item.subtitle.isNotBlank()) {
            Text(
                item.subtitle, maxLines = 1, overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodySmall, color = Swar.TextDim,
                modifier = if (round) Modifier.align(Alignment.CenterHorizontally) else Modifier,
            )
        }
    }
}

// ----------------------------------------------------------------- sections

@Composable
fun SectionTitle(title: String, subtitle: String = "", onMore: (() -> Unit)? = null) {
    Row(
        Modifier.fillMaxWidth().padding(start = 18.dp, end = 8.dp, top = 22.dp, bottom = 8.dp),
        verticalAlignment = Alignment.Bottom,
    ) {
        Column(Modifier.weight(1f)) {
            if (subtitle.isNotBlank()) {
                Text(subtitle.uppercase(), style = MaterialTheme.typography.labelSmall, color = Swar.Cyan)
            }
            Text(title, style = MaterialTheme.typography.titleLarge, color = Swar.Text, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        if (onMore != null) {
            TextButton(onClick = onMore) { Text("More", color = Swar.Cyan) }
        }
    }
}

/**
 * Lays a section out inside a LazyColumn: list rows one by one (long playlists
 * stay fast), carousels as a row, quick picks as a sideways grid of rows.
 */
fun LazyListScope.section(
    section: Section,
    key: String,
    actions: Actions,
    numbered: Boolean = false,
    showArt: Boolean = true,
    allSongs: List<Song>? = null,
    continuation: String? = null,
    /** Songs start their own radio (Home, Search) instead of playing the list. */
    radio: Boolean = false,
) {
    if (section.title.isNotBlank()) {
        item(key = "$key-title") {
            SectionTitle(section.title, section.subtitle, section.more?.let { m -> { actions.browse(m.browseId, m.params) } })
        }
    }
    when (section.layout) {
        Layout.LIST -> {
            val songs = section.items.filterIsInstance<Song>()
            section.items.forEachIndexed { i, it ->
                item(key = "$key-$i") {
                    if (it is Song) {
                        SongRow(
                            it,
                            onClick = {
                                if (radio) actions.open(it) else {
                                    val list = allSongs ?: songs
                                    actions.playFrom(list, list.indexOf(it).coerceAtLeast(0), continuation ?: section.continuation)
                                }
                            },
                            number = if (numbered) songs.indexOf(it) + 1 else null,
                            showArt = showArt,
                        )
                    } else {
                        ListRowItem(it)
                    }
                }
            }
        }
        Layout.CAROUSEL -> item(key = "$key-row") {
            LazyRow(contentPadding = PaddingValues(horizontal = 10.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                items(section.items) { ItemCard(it) }
            }
        }
        Layout.GRID -> {
            if (section.items.all { it is Song }) {
                item(key = "$key-grid") {
                    val rows = minOf(4, section.items.size)
                    LazyHorizontalGrid(
                        rows = GridCells.Fixed(rows),
                        modifier = Modifier.fillMaxWidth().height((rows * 66).dp),
                    ) {
                        items(section.items) { song ->
                            SongRow(song as Song, onClick = { actions.open(song) }, modifier = Modifier.width(310.dp))
                        }
                    }
                }
            } else {
                section.items.chunked(2).forEachIndexed { r, pair ->
                    item(key = "$key-g$r") {
                        Row(Modifier.fillMaxWidth().padding(horizontal = 10.dp)) {
                            pair.forEach { ItemCard(it, Modifier.weight(1f), width = 176.dp) }
                            if (pair.size == 1) Spacer(Modifier.weight(1f))
                        }
                    }
                }
            }
        }
    }
}

/** An album, artist or playlist in a list (search results). */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ListRowItem(item: Item) {
    val actions = LocalActions.current
    Row(
        Modifier.fillMaxWidth()
            .combinedClickable(onClick = { actions.open(item) }, onLongClick = { actions.menuFor = item })
            .padding(horizontal = 16.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Artwork(item.thumbnail, Modifier.size(52.dp), if (item is Artist) CircleShape else RoundedCornerShape(10.dp))
        Column(Modifier.weight(1f).padding(start = 14.dp)) {
            Text(item.title, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.titleSmall)
            Text(item.subtitle, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyMedium, color = Swar.TextDim)
        }
    }
}

// ------------------------------------------------------------ load states

@Composable
fun Loading(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().padding(48.dp), contentAlignment = Alignment.Center) {
        PlayingBars(Modifier.size(40.dp), always = true)
    }
}

@Composable
fun ErrorState(message: String, onRetry: () -> Unit, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text("Couldn't load this", style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(6.dp))
        Text(message, style = MaterialTheme.typography.bodyMedium, color = Swar.TextDim)
        Spacer(Modifier.height(18.dp))
        GradientButton("Try again", onRetry)
    }
}

@Composable
fun GradientButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, icon: (@Composable () -> Unit)? = null) {
    Button(
        onClick = onClick,
        modifier = modifier.background(Swar.AccentHorizontal, RoundedCornerShape(28.dp)),
        colors = ButtonDefaults.buttonColors(containerColor = androidx.compose.ui.graphics.Color.Transparent),
        contentPadding = PaddingValues(horizontal = 22.dp, vertical = 12.dp),
    ) {
        if (icon != null) { icon(); Spacer(Modifier.width(8.dp)) }
        Text(text, fontWeight = FontWeight.SemiBold, color = Swar.Text)
    }
}
