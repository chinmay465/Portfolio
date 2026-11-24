package com.chinmay.swar.ui.player

import android.graphics.drawable.BitmapDrawable
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.basicMarquee
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.QueueMusic
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.GraphicEq
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Repeat
import androidx.compose.material.icons.rounded.RepeatOne
import androidx.compose.material.icons.rounded.Shuffle
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material.icons.rounded.SkipPrevious
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.media3.common.Player
import androidx.palette.graphics.Palette
import coil.imageLoader
import coil.request.ImageRequest
import coil.request.SuccessResult
import com.chinmay.swar.playback.AudioQuality
import com.chinmay.swar.playback.Streams
import com.chinmay.swar.playback.SwarPlayer
import com.chinmay.swar.ui.Artwork
import com.chinmay.swar.ui.LocalActions
import com.chinmay.swar.ui.PlayingBars
import com.chinmay.swar.ui.durationText
import com.chinmay.swar.ui.theme.Aurora
import com.chinmay.swar.ui.theme.Swar
import com.chinmay.swar.ui.theme.glass
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

// -------------------------------------------------------------- mini player

/** The bar above the tabs. Tap or swipe up to open the player. */
@Composable
fun MiniPlayer(modifier: Modifier = Modifier, onOpen: () -> Unit) {
    val state by SwarPlayer.state.collectAsStateWithLifecycle()
    val position by SwarPlayer.position.collectAsStateWithLifecycle()
    val song = state.current ?: return
    Box(
        modifier
            .padding(horizontal = 8.dp)
            .fillMaxWidth()
            .height(64.dp)
            .shadow(18.dp, RoundedCornerShape(18.dp), ambientColor = Swar.Blue, spotColor = Swar.Violet)
            .glass(RoundedCornerShape(18.dp), fill = Color(0xF2111530))
            .clip(RoundedCornerShape(18.dp))
            .clickable(onClick = onOpen),
    ) {
        Row(Modifier.fillMaxSize().padding(start = 8.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Artwork(song.thumbnail, Modifier.size(46.dp), RoundedCornerShape(12.dp))
            Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                Text(song.title, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.titleSmall)
                Text(song.artistText, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall, color = Swar.TextDim)
            }
            PlayPause(state.playing, state.buffering, size = 44, onClick = SwarPlayer::toggle)
            IconButton(onClick = SwarPlayer::next, enabled = state.hasNext) {
                Icon(Icons.Rounded.SkipNext, "Next", tint = if (state.hasNext) Swar.Text else Swar.TextFaint)
            }
        }
        // Progress, as a glowing line along the bottom edge.
        val fraction = if (state.durationMs > 0) (position.toFloat() / state.durationMs).coerceIn(0f, 1f) else 0f
        Box(
            Modifier.align(Alignment.BottomStart).fillMaxWidth().height(2.dp).drawBehind {
                drawLine(Swar.AccentHorizontal, Offset(0f, size.height / 2), Offset(size.width * fraction, size.height / 2), strokeWidth = size.height)
            },
        )
    }
}

@Composable
private fun PlayPause(playing: Boolean, buffering: Boolean, size: Int, onClick: () -> Unit) {
    Box(
        Modifier.size(size.dp).clip(CircleShape).background(Swar.Accent).clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        if (buffering) {
            CircularProgressIndicator(Modifier.size((size * 0.5f).dp), color = Swar.Text, strokeWidth = 2.dp)
        } else {
            Icon(
                if (playing) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                if (playing) "Pause" else "Play",
                tint = Swar.Text, modifier = Modifier.size((size * 0.55f).dp),
            )
        }
    }
}

// -------------------------------------------------------------- full player

/**
 * Now playing. Swiping it down (handled by the caller, on the whole screen)
 * closes it into the mini player; so does the arrow and Back.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun FullPlayer(onClose: () -> Unit, modifier: Modifier = Modifier) {
    val state by SwarPlayer.state.collectAsStateWithLifecycle()
    val position by SwarPlayer.position.collectAsStateWithLifecycle()
    val liked by SwarPlayer.liked.collectAsStateWithLifecycle()
    val stream by Streams.last.collectAsStateWithLifecycle()
    val quality by Streams.quality.collectAsStateWithLifecycle()
    val actions = LocalActions.current
    val song = state.current
    var showQueue by remember { mutableStateOf(false) }
    var showQuality by remember { mutableStateOf(false) }

    // The backdrop glows in the colours of the cover.
    val context = LocalContext.current
    var glow by remember { mutableStateOf(Swar.Cyan to Swar.Violet) }
    LaunchedEffect(song?.thumbnail) {
        val url = song?.thumbnail.orEmpty()
        if (url.isEmpty()) return@LaunchedEffect
        val result = context.imageLoader.execute(ImageRequest.Builder(context).data(url).allowHardware(false).size(128).build())
        val bitmap = ((result as? SuccessResult)?.drawable as? BitmapDrawable)?.bitmap ?: return@LaunchedEffect
        val palette = withContext(Dispatchers.Default) { Palette.from(bitmap).generate() }
        val a = palette.vibrantSwatch ?: palette.dominantSwatch
        val b = palette.darkVibrantSwatch ?: palette.mutedSwatch ?: a
        if (a != null && b != null) glow = Color(a.rgb) to Color(b.rgb)
    }
    val tint1 by animateColorAsState(glow.first, tween(600), label = "glow1")
    val tint2 by animateColorAsState(glow.second, tween(600), label = "glow2")

    Aurora(modifier, tint = tint1, tint2 = tint2, strength = 1.6f) {
        if (song == null) return@Aurora
        Column(
            Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.statusBars).windowInsetsPadding(WindowInsets.navigationBars)
                .padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // Top: close, label, menu
            Row(Modifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onClose) { Icon(Icons.Rounded.KeyboardArrowDown, "Close player", Modifier.size(30.dp)) }
                Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(Modifier.width(36.dp).height(4.dp).clip(RoundedCornerShape(2.dp)).background(Color(0x55FFFFFF)))
                    Spacer(Modifier.height(6.dp))
                    Text("NOW PLAYING", style = MaterialTheme.typography.labelSmall, color = Swar.TextDim)
                }
                IconButton(onClick = { actions.menuFor = song }) { Icon(Icons.Rounded.MoreVert, "More") }
            }

            // Cover
            BoxWithConstraints(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                val side = minOf(maxWidth, maxHeight) - 8.dp
                Artwork(
                    song.thumbnail,
                    Modifier.size(side).shadow(36.dp, RoundedCornerShape(26.dp), ambientColor = tint1, spotColor = tint2),
                    RoundedCornerShape(26.dp),
                )
            }

            // Title, artist, like
            Row(Modifier.fillMaxWidth().padding(top = 18.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(song.title, style = MaterialTheme.typography.headlineMedium, maxLines = 1, modifier = Modifier.basicMarquee())
                    val artist = song.artists.firstOrNull { it.browseId != null }
                    Text(
                        song.artistText.ifBlank { song.album?.name.orEmpty() },
                        style = MaterialTheme.typography.titleMedium, color = Swar.Cyan, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.clickable(enabled = artist != null) {
                            artist?.browseId?.let { onClose(); actions.browse(it) }
                        },
                    )
                }
                IconButton(onClick = SwarPlayer::toggleLike) {
                    Icon(
                        if (liked == true) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,
                        if (liked == true) "Unlike" else "Like",
                        tint = if (liked == true) Swar.Violet else Swar.TextDim,
                    )
                }
            }

            // Seek bar
            var dragging by remember { mutableStateOf(false) }
            var dragValue by remember { mutableFloatStateOf(0f) }
            val duration = state.durationMs.coerceAtLeast(1)
            val shown = if (dragging) dragValue else (position.toFloat() / duration).coerceIn(0f, 1f)
            Slider(
                value = shown,
                onValueChange = { dragging = true; dragValue = it },
                onValueChangeFinished = { SwarPlayer.seekTo((dragValue * duration).toLong()); dragging = false },
                colors = SliderDefaults.colors(
                    thumbColor = Color.White, activeTrackColor = Swar.Cyan, inactiveTrackColor = Color(0x33FFFFFF),
                ),
                modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
            )
            Row(Modifier.fillMaxWidth()) {
                Text(durationText(((if (dragging) dragValue * duration else position.toFloat()) / 1000).toInt()).ifEmpty { "0:00" }, style = MaterialTheme.typography.labelMedium, color = Swar.TextDim)
                Spacer(Modifier.weight(1f))
                Text(durationText((state.durationMs / 1000).toInt()), style = MaterialTheme.typography.labelMedium, color = Swar.TextDim)
            }

            // Controls
            Row(
                Modifier.fillMaxWidth().padding(vertical = 14.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = SwarPlayer::toggleShuffle) {
                    Icon(Icons.Rounded.Shuffle, "Shuffle", tint = if (state.shuffle) Swar.Cyan else Swar.TextDim)
                }
                IconButton(onClick = SwarPlayer::previous, modifier = Modifier.size(56.dp)) {
                    Icon(Icons.Rounded.SkipPrevious, "Previous", Modifier.size(38.dp))
                }
                PlayPause(state.playing, state.buffering, size = 76, onClick = SwarPlayer::toggle)
                IconButton(onClick = SwarPlayer::next, enabled = state.hasNext, modifier = Modifier.size(56.dp)) {
                    Icon(Icons.Rounded.SkipNext, "Next", Modifier.size(38.dp), tint = if (state.hasNext) Swar.Text else Swar.TextFaint)
                }
                IconButton(onClick = SwarPlayer::cycleRepeat) {
                    Icon(
                        if (state.repeat == Player.REPEAT_MODE_ONE) Icons.Rounded.RepeatOne else Icons.Rounded.Repeat, "Repeat",
                        tint = if (state.repeat == Player.REPEAT_MODE_OFF) Swar.TextDim else Swar.Cyan,
                    )
                }
            }

            // Quality and queue
            Row(Modifier.fillMaxWidth().padding(bottom = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Row(
                    Modifier.clip(RoundedCornerShape(16.dp)).glass(RoundedCornerShape(16.dp)).clickable { showQuality = true }
                        .padding(horizontal = 12.dp, vertical = 7.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Rounded.GraphicEq, null, Modifier.size(16.dp), tint = Swar.Cyan)
                    Spacer(Modifier.width(6.dp))
                    val label = stream?.takeIf { it.videoId == song.videoId }?.label
                    Text(listOfNotNull(quality.label, label).joinToString(" · "), style = MaterialTheme.typography.labelMedium)
                }
                Spacer(Modifier.weight(1f))
                IconButton(onClick = { showQueue = true }) { Icon(Icons.AutoMirrored.Rounded.QueueMusic, "Up next") }
            }
        }
    }

    if (showQueue) QueueSheet { showQueue = false }
    if (showQuality) QualitySheet { showQuality = false }
}

// ---------------------------------------------------------------- sheets

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun QueueSheet(onDismiss: () -> Unit) {
    val state by SwarPlayer.state.collectAsStateWithLifecycle()
    val list = rememberLazyListState(initialFirstVisibleItemIndex = state.index.coerceAtLeast(0))
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(), containerColor = Color(0xFF0C0E1A)) {
        Text("Up next", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp))
        LazyColumn(state = list, modifier = Modifier.fillMaxHeight(0.75f)) {
            itemsIndexed(state.queue, key = { i, s -> "$i-${s.videoId}" }) { i, s ->
                val current = i == state.index
                Row(
                    Modifier.fillMaxWidth().clickable { SwarPlayer.skipTo(i) }.padding(horizontal = 16.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box {
                        Artwork(s.thumbnail, Modifier.size(46.dp), RoundedCornerShape(10.dp))
                        if (current) PlayingBars(Modifier.align(Alignment.Center).size(20.dp))
                    }
                    Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                        Text(s.title, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.titleSmall, color = if (current) Swar.Cyan else Swar.Text)
                        Text(s.artistText, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall, color = Swar.TextDim)
                    }
                    if (!current) IconButton(onClick = { SwarPlayer.remove(i) }) { Icon(Icons.Rounded.Close, "Remove", tint = Swar.TextFaint) }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun QualitySheet(onDismiss: () -> Unit) {
    val quality by Streams.quality.collectAsStateWithLifecycle()
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = Color(0xFF0C0E1A)) {
        Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 24.dp)) {
            Text("Audio quality", style = MaterialTheme.typography.titleLarge)
            Text("Applies from the next song.", style = MaterialTheme.typography.bodySmall, color = Swar.TextDim)
            Spacer(Modifier.height(8.dp))
            AudioQuality.entries.forEach { q ->
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { Streams.setQuality(q); onDismiss() }.padding(vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    RadioButton(selected = q == quality, onClick = { Streams.setQuality(q); onDismiss() }, colors = RadioButtonDefaults.colors(selectedColor = Swar.Cyan))
                    Column(Modifier.padding(start = 6.dp)) {
                        Text(q.label, style = MaterialTheme.typography.titleSmall)
                        Text(q.detail, style = MaterialTheme.typography.bodySmall, color = Swar.TextDim)
                    }
                }
            }
        }
    }
}
