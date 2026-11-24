package com.chinmay.swar.playback

import android.content.ComponentName
import android.content.Context
import android.net.Uri
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.HttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.chinmay.swar.data.Ref
import com.chinmay.swar.data.Song
import com.chinmay.swar.data.YtMusic
import com.google.common.util.concurrent.ListenableFuture
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

/**
 * What the screens talk to: the queue, what's playing and the controls. Runs
 * on the main thread against the ExoPlayer that [PlaybackService] owns (same
 * process), and keeps the radio going by fetching more of it near the end.
 */
@OptIn(UnstableApi::class)
object SwarPlayer {

    data class State(
        val current: Song? = null,
        val index: Int = -1,
        val queue: List<Song> = emptyList(),
        val playing: Boolean = false,
        val buffering: Boolean = false,
        val durationMs: Long = 0,
        val shuffle: Boolean = false,
        val repeat: Int = Player.REPEAT_MODE_OFF,
    ) {
        val hasNext: Boolean get() = index in 0 until queue.size - 1 || repeat != Player.REPEAT_MODE_OFF
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var player: ExoPlayer? = null
    private val pending = mutableListOf<(ExoPlayer) -> Unit>()
    private var controller: ListenableFuture<MediaController>? = null
    private lateinit var appContext: Context

    private val songs = HashMap<String, Song>()

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    private val _currentId = MutableStateFlow<String?>(null)
    /** Just the playing song's id: cheap to watch from every list row. */
    val currentId: StateFlow<String?> = _currentId.asStateFlow()

    private val _isPlaying = MutableStateFlow(false)
    val isPlaying: StateFlow<Boolean> = _isPlaying.asStateFlow()

    private val _position = MutableStateFlow(0L)
    val position: StateFlow<Long> = _position.asStateFlow()

    private val _liked = MutableStateFlow<Boolean?>(null)
    /** Like status of the current song; null when unknown or signed out. */
    val liked: StateFlow<Boolean?> = _liked.asStateFlow()

    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 4)
    val messages: SharedFlow<String> = _messages.asSharedFlow()

    /** Where more songs come from when the queue runs low. */
    private sealed interface Source {
        data class Radio(val playlistId: String?, val token: String) : Source
        data class Shelf(val token: String) : Source
    }

    private var source: Source? = null
    private var extending: Job? = null
    private var ticker: Job? = null
    private var retried: String? = null

    // ---------------------------------------------------------------- service

    /** Starts (binds) the playback service. Safe to call repeatedly. */
    fun connect(context: Context) {
        appContext = context.applicationContext
        if (controller != null) return
        val token = SessionToken(appContext, ComponentName(appContext, PlaybackService::class.java))
        controller = MediaController.Builder(appContext, token).buildAsync()
    }

    internal fun attach(context: Context, p: ExoPlayer) {
        appContext = context.applicationContext
        player = p
        p.addListener(listener)
        if (p.mediaItemCount == 0) restore(p)
        pending.toList().forEach { it(p) }
        pending.clear()
        publish()
    }

    internal fun detach() {
        player?.let { save(it); it.removeListener(listener) }
        player = null
        ticker?.cancel()
        controller?.let { MediaController.releaseFuture(it) }
        controller = null
        _state.value = _state.value.copy(playing = false, buffering = false)
        _isPlaying.value = false
    }

    private fun withPlayer(block: (ExoPlayer) -> Unit) {
        val p = player
        if (p != null) block(p) else {
            pending += block
            if (::appContext.isInitialized) connect(appContext)
        }
    }

    // ---------------------------------------------------------------- queue

    fun itemFor(item: MediaItem): MediaItem =
        songs[item.mediaId]?.let { mediaItem(it) } ?: item.buildUpon()
            .setUri(Uri.parse("swar://song/${item.mediaId}"))
            .setCustomCacheKey(item.mediaId)
            .build()

    private fun mediaItem(song: Song): MediaItem = MediaItem.Builder()
        .setMediaId(song.videoId)
        .setUri(Uri.parse("swar://song/${song.videoId}"))
        .setCustomCacheKey(song.videoId)
        .setMediaMetadata(
            MediaMetadata.Builder()
                .setTitle(song.title)
                .setArtist(song.artistText)
                .setAlbumTitle(song.album?.name)
                .setArtworkUri(song.thumbnail.takeIf { it.isNotEmpty() }?.let(Uri::parse))
                .setIsPlayable(true)
                .setIsBrowsable(false)
                .build(),
        )
        .build()

    /** Play [list] from [start]. Music videos play as their song version. */
    fun play(list: List<Song>, start: Int = 0, shuffle: Boolean = false, continuation: String? = null) {
        if (list.isEmpty()) return
        val playable = list.map { it.playable }.distinctBy { it.videoId }
        val first = list.getOrNull(start)?.playable?.videoId
        val startIndex = playable.indexOfFirst { it.videoId == first }.coerceAtLeast(0)
        playable.forEach { songs[it.videoId] = it }
        source = continuation?.let { Source.Shelf(it) }
        withPlayer { p ->
            p.shuffleModeEnabled = shuffle
            p.setMediaItems(playable.map(::mediaItem), if (shuffle) 0 else startIndex, 0)
            p.prepare()
            p.play()
            if (shuffle) p.seekTo(p.currentTimeline.getFirstWindowIndex(true), 0)
        }
    }

    /** Play one song now; its radio fills Up next. */
    fun playRadio(song: Song) {
        if ((song.isVideo && song.songVersion == null) || song.title.isEmpty()) {
            // A music video: Up next links its song version. Look that up first
            // and play the song, never the video's audio. (Also a shared link,
            // which arrives with nothing but its id.)
            scope.launch {
                val radio = runCatching { YtMusic.radio(song.videoId) }.getOrNull()
                val start = radio?.songs?.firstOrNull { it.videoId == song.videoId }?.playable ?: song
                val rest = radio?.songs.orEmpty().map { it.playable }
                    .filter { it.videoId != start.videoId && it.videoId != song.videoId }
                play(listOf(start) + rest)
                source = radio?.continuation?.let { Source.Radio(radio.playlistId, it) }
            }
            return
        }
        val s = song.playable
        play(listOf(s))
        source = null
        scope.launch {
            val radio = runCatching { YtMusic.radio(s.videoId) }.getOrNull() ?: return@launch
            val more = radio.songs.map { it.playable }.filter { it.videoId != s.videoId }
            append(more)
            source = radio.continuation?.let { Source.Radio(radio.playlistId, it) }
            radio.liked?.let { if (state.value.current?.videoId == s.videoId) _liked.value = it }
        }
    }

    /** A mix, radio or album playlist: ask YouTube Music for its queue. */
    fun playPlaylist(playlistId: String, shuffle: Boolean = false, params: String? = null) {
        scope.launch {
            val q = runCatching { YtMusic.playlistQueue(playlistId, params = params) }
                .onFailure { _messages.tryEmit("Couldn't load that: ${it.message ?: "network error"}") }
                .getOrNull() ?: return@launch
            if (q.songs.isEmpty()) { _messages.tryEmit("Nothing to play there"); return@launch }
            play(q.songs, 0, shuffle)
            source = q.continuation?.let { Source.Radio(q.playlistId ?: playlistId, it) }
        }
    }

    fun playNext(song: Song) {
        val s = song.playable.also { songs[it.videoId] = it }
        withPlayer { p ->
            if (p.mediaItemCount == 0) { play(listOf(s)); return@withPlayer }
            p.addMediaItem(p.currentMediaItemIndex + 1, mediaItem(s))
        }
        _messages.tryEmit("Playing next: ${s.title}")
    }

    fun addToQueue(song: Song) {
        val s = song.playable.also { songs[it.videoId] = it }
        withPlayer { p ->
            if (p.mediaItemCount == 0) { play(listOf(s)); return@withPlayer }
            p.addMediaItem(mediaItem(s))
        }
        _messages.tryEmit("Added to queue: ${s.title}")
    }

    private fun append(list: List<Song>) {
        if (list.isEmpty()) return
        withPlayer { p ->
            val have = (0 until p.mediaItemCount).map { p.getMediaItemAt(it).mediaId }.toHashSet()
            val fresh = list.filter { it.videoId !in have }.distinctBy { it.videoId }
            fresh.forEach { songs[it.videoId] = it }
            p.addMediaItems(fresh.map(::mediaItem))
        }
    }

    /** Near the end of the queue, fetch the next part of the radio or playlist. */
    private fun maybeExtend(p: ExoPlayer) {
        val src = source ?: return
        if (extending?.isActive == true) return
        if (p.mediaItemCount - p.currentMediaItemIndex > 4) return
        extending = scope.launch {
            when (src) {
                is Source.Radio -> {
                    val more = runCatching { YtMusic.queueMore(src.playlistId, src.token) }.getOrNull() ?: return@launch
                    source = more.continuation?.let { Source.Radio(src.playlistId, it) }
                    append(more.songs.map { it.playable })
                }
                is Source.Shelf -> {
                    val more = runCatching { YtMusic.browseMore(src.token) }.getOrNull() ?: return@launch
                    source = more.continuation?.let { Source.Shelf(it) }
                    append(more.items.filterIsInstance<Song>().map { it.playable })
                }
            }
        }
    }

    // -------------------------------------------------------------- controls

    fun toggle() = withPlayer { p ->
        if (p.isPlaying) p.pause() else {
            if (p.playbackState == Player.STATE_IDLE) p.prepare()
            if (p.playbackState == Player.STATE_ENDED) p.seekTo(0)
            p.play()
        }
    }

    fun next() = withPlayer { if (it.hasNextMediaItem()) it.seekToNextMediaItem() }
    fun previous() = withPlayer { it.seekToPrevious() }
    fun seekTo(ms: Long) = withPlayer { it.seekTo(ms); _position.value = ms }
    fun skipTo(index: Int) = withPlayer { p -> if (index in 0 until p.mediaItemCount) { p.seekTo(index, 0); p.play() } }
    fun remove(index: Int) = withPlayer { p -> if (index in 0 until p.mediaItemCount && index != p.currentMediaItemIndex) p.removeMediaItem(index) }
    fun move(from: Int, to: Int) = withPlayer { p -> if (from in 0 until p.mediaItemCount && to in 0 until p.mediaItemCount) p.moveMediaItem(from, to) }
    fun toggleShuffle() = withPlayer { it.shuffleModeEnabled = !it.shuffleModeEnabled }
    fun cycleRepeat() = withPlayer {
        it.repeatMode = when (it.repeatMode) {
            Player.REPEAT_MODE_OFF -> Player.REPEAT_MODE_ALL
            Player.REPEAT_MODE_ALL -> Player.REPEAT_MODE_ONE
            else -> Player.REPEAT_MODE_OFF
        }
    }

    fun toggleLike() {
        val song = state.value.current ?: return
        if (!YtMusic.account.signedIn.value) { _messages.tryEmit("Sign in (Library tab) to like songs"); return }
        val now = !(liked.value ?: false)
        _liked.value = now
        scope.launch {
            runCatching { YtMusic.like(song.videoId, now) }.onFailure {
                _liked.value = !now
                _messages.tryEmit("Couldn't update the like")
            }
        }
    }

    // --------------------------------------------------------------- state

    private val listener = object : Player.Listener {
        override fun onEvents(player: Player, events: Player.Events) = publish()

        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            val p = player ?: return
            retried = null
            maybeExtend(p)
            refreshLike(mediaItem?.mediaId)
            prefetch(p)
            save(p)
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            if (isPlaying) startTicker() else { ticker?.cancel(); player?.let { _position.value = it.currentPosition; save(it) } }
        }

        override fun onPlayerError(error: PlaybackException) {
            val p = player ?: return
            val id = p.currentMediaItem?.mediaId ?: return
            val http = generateSequence(error.cause) { it.cause }.filterIsInstance<HttpDataSource.InvalidResponseCodeException>().firstOrNull()
            Streams.invalidate(id)
            if (retried != id) {
                // Usually an expired or refused stream URL: look it up again and carry on.
                retried = id
                val at = p.currentPosition
                p.prepare()
                p.seekTo(at)
                p.play()
                return
            }
            val why = if (http != null) "YouTube refused the stream (HTTP ${http.responseCode})" else (error.cause?.message ?: error.errorCodeName)
            _messages.tryEmit("Can't play ${songs[id]?.title ?: "this song"}: $why")
            if (p.hasNextMediaItem()) {
                p.seekToNextMediaItem()
                p.prepare()
                p.play()
            }
        }
    }

    private fun publish() {
        val p = player ?: return
        val queue = (0 until p.mediaItemCount).map { i ->
            val item = p.getMediaItemAt(i)
            songs[item.mediaId] ?: Song(
                videoId = item.mediaId,
                title = item.mediaMetadata.title?.toString().orEmpty(),
                artists = listOfNotNull(item.mediaMetadata.artist?.toString()?.let { Ref(it) }),
                thumbnail = item.mediaMetadata.artworkUri?.toString().orEmpty(),
            )
        }
        val index = p.currentMediaItemIndex.takeIf { p.mediaItemCount > 0 } ?: -1
        _state.value = State(
            current = queue.getOrNull(index),
            index = index,
            queue = queue,
            playing = p.isPlaying || (p.playWhenReady && p.playbackState == Player.STATE_BUFFERING),
            buffering = p.playbackState == Player.STATE_BUFFERING,
            durationMs = p.duration.takeIf { it > 0 } ?: ((queue.getOrNull(index)?.durationSec ?: 0) * 1000L),
            shuffle = p.shuffleModeEnabled,
            repeat = p.repeatMode,
        )
        _currentId.value = _state.value.current?.videoId
        _isPlaying.value = _state.value.playing
        _position.value = p.currentPosition
    }

    private fun startTicker() {
        ticker?.cancel()
        ticker = scope.launch {
            while (isActive) {
                player?.let { _position.value = it.currentPosition }
                delay(250)
            }
        }
    }

    private fun refreshLike(videoId: String?) {
        _liked.value = null
        if (videoId == null || !YtMusic.account.signedIn.value) return
        scope.launch {
            val status = runCatching { YtMusic.likeStatus(videoId) }.getOrNull()
            if (state.value.current?.videoId == videoId) _liked.value = status
        }
    }

    /** Look the next song's stream up early, so it starts without a gap. */
    private fun prefetch(p: ExoPlayer) {
        val nextIndex = p.nextMediaItemIndex.takeIf { it >= 0 } ?: return
        val id = p.getMediaItemAt(nextIndex).mediaId
        scope.launch { withContext(Dispatchers.IO) { runCatching { Streams.resolve(id) } } }
    }

    // ------------------------------------------------- remember the queue

    private const val PREFS = "swar_queue"

    private fun save(p: ExoPlayer) {
        if (!::appContext.isInitialized) return
        val list = (0 until p.mediaItemCount).take(200).mapNotNull { songs[p.getMediaItemAt(it).mediaId] }
        val json = JSONObject()
            .put("index", p.currentMediaItemIndex)
            .put("position", p.currentPosition)
            .put("songs", JSONArray(list.map { s ->
                JSONObject().put("id", s.videoId).put("t", s.title).put("a", s.artistText)
                    .put("al", s.album?.name.orEmpty()).put("alId", s.album?.browseId.orEmpty())
                    .put("th", s.thumbnail).put("d", s.durationSec)
            }))
        appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("queue", json.toString()).apply()
    }

    /** Last session's queue, paused where it was left. */
    private fun restore(p: ExoPlayer) {
        val raw = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("queue", null) ?: return
        runCatching {
            val json = JSONObject(raw)
            val arr = json.getJSONArray("songs")
            val list = (0 until arr.length()).map { i ->
                val o = arr.getJSONObject(i)
                Song(
                    videoId = o.getString("id"), title = o.optString("t"),
                    artists = o.optString("a").takeIf { it.isNotBlank() }?.let { listOf(Ref(it)) }.orEmpty(),
                    album = o.optString("al").takeIf { it.isNotBlank() }?.let { Ref(it, o.optString("alId").ifBlank { null }) },
                    thumbnail = o.optString("th"), durationSec = o.optInt("d"),
                )
            }
            if (list.isEmpty()) return
            list.forEach { songs[it.videoId] = it }
            p.setMediaItems(list.map(::mediaItem), json.optInt("index").coerceIn(0, list.size - 1), json.optLong("position"))
            p.prepare()
        }
    }
}
