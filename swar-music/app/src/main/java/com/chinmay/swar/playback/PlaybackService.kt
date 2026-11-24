package com.chinmay.swar.playback

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.AudioManager
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.SystemClock
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.chinmay.swar.MainActivity
import com.chinmay.swar.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import kotlin.math.abs
import androidx.media.app.NotificationCompat as MediaNotificationCompat

/**
 * Keeps the app alive while music plays with the screen off or another app
 * open: a mediaPlayback foreground service with a media notification, a
 * MediaSession (lock screen, headset and Bluetooth buttons, Android Auto-style
 * controls) and a wake lock. The audio itself is played by the
 * WebView in MainActivity; this service only mirrors and controls it.
 *
 * No audio focus handling here on purpose: WebView requests audio focus for the
 * song itself (and pauses for calls and other music apps). A second request from
 * this service took focus away from WebView, which paused the song the moment
 * it started.
 */
class PlaybackService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private lateinit var session: MediaSessionCompat

    private var last: PlayerState? = null
    private var wasPlaying = false
    private var sessionPositionMs = 0L
    private var sessionPositionAt = 0L

    private var artwork: Bitmap? = null
    private var artworkUrl = ""
    private var artworkJob: Job? = null

    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null
    private var noisyRegistered = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        running = true
        createChannel()
        session = MediaSessionCompat(this, "Swar").apply {
            setCallback(sessionCallback)
            setSessionActivity(openAppIntent())
            isActive = true
        }
        val initial = PlayerBridge.state.value
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK else 0
        ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(initial), type)
        scope.launch { PlayerBridge.state.collect { render(it) } }
        // Redrawn only when the label changes, about once per song.
        scope.launch { PlayerBridge.audio.collect { last?.let(::postNotification) } }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_PLAY -> PlayerBridge.send(PlayerCommand.Play)
            ACTION_PAUSE -> PlayerBridge.send(PlayerCommand.Pause)
            ACTION_NEXT -> PlayerBridge.send(PlayerCommand.Next)
            ACTION_PREVIOUS -> PlayerBridge.send(PlayerCommand.Previous)
            ACTION_CLOSE -> {
                PlayerBridge.send(PlayerCommand.Pause)
                PlayerBridge.requestClose()
                stopSelf()
            }
        }
        return START_NOT_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        // Swiped away from recents: the WebView goes with the activity, so stop too.
        PlayerBridge.send(PlayerCommand.Pause)
        stopSelf()
    }

    override fun onDestroy() {
        running = false
        scope.cancel()
        releaseLocks()
        unregisterNoisy()
        session.isActive = false
        session.release()
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        super.onDestroy()
    }

    // ------------------------------------------------------------------ state

    private fun render(state: PlayerState) {
        val prev = last
        last = state

        if (state.playing != wasPlaying) {
            wasPlaying = state.playing
            onPlayingChanged(state.playing)
        }
        if (state.artworkUrl != artworkUrl) loadArtwork(state.artworkUrl)

        val metadataChanged = prev == null || prev.title != state.title || prev.artist != state.artist ||
            prev.album != state.album || prev.durationMs != state.durationMs
        if (metadataChanged) session.setMetadata(buildMetadata(state))

        // The system extrapolates the position while playing, so only resend on a jump.
        if (prev == null || prev.playing != state.playing || positionDrifted(state)) {
            session.setPlaybackState(buildPlaybackState(state))
        }
        if (metadataChanged || prev?.playing != state.playing) postNotification(state)
    }

    private fun positionDrifted(state: PlayerState): Boolean {
        val expected = if (state.playing) sessionPositionMs + (SystemClock.elapsedRealtime() - sessionPositionAt) else sessionPositionMs
        return abs(state.positionMs - expected) > 2_000
    }

    private fun onPlayingChanged(playing: Boolean) {
        if (playing) {
            acquireLocks()
            registerNoisy()
        } else {
            releaseLocks()
            unregisterNoisy()
        }
    }

    private fun buildMetadata(state: PlayerState): MediaMetadataCompat =
        MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, state.title)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, state.artist)
            .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, state.album)
            .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, state.durationMs)
            .apply { artwork?.let { putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, it) } }
            .build()

    private fun buildPlaybackState(state: PlayerState): PlaybackStateCompat {
        sessionPositionMs = state.positionMs
        sessionPositionAt = SystemClock.elapsedRealtime()
        return PlaybackStateCompat.Builder()
            .setActions(
                PlaybackStateCompat.ACTION_PLAY or PlaybackStateCompat.ACTION_PAUSE or
                    PlaybackStateCompat.ACTION_PLAY_PAUSE or PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
                    PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or PlaybackStateCompat.ACTION_SEEK_TO or
                    PlaybackStateCompat.ACTION_STOP,
            )
            .setState(
                if (state.playing) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED,
                state.positionMs,
                if (state.playing) 1f else 0f,
                sessionPositionAt,
            )
            .build()
    }

    private val sessionCallback = object : MediaSessionCompat.Callback() {
        override fun onPlay() = PlayerBridge.send(PlayerCommand.Play)
        override fun onPause() = PlayerBridge.send(PlayerCommand.Pause)
        override fun onStop() = PlayerBridge.send(PlayerCommand.Pause)
        override fun onSkipToNext() = PlayerBridge.send(PlayerCommand.Next)
        override fun onSkipToPrevious() = PlayerBridge.send(PlayerCommand.Previous)
        override fun onSeekTo(pos: Long) = PlayerBridge.send(PlayerCommand.SeekTo(pos))
    }

    // ------------------------------------------------------------ notification

    private fun createChannel() {
        val channel = NotificationChannel(CHANNEL_ID, getString(R.string.channel_playback), NotificationManager.IMPORTANCE_LOW)
            .apply { setShowBadge(false) }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    private fun postNotification(state: PlayerState) {
        getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, buildNotification(state))
    }

    private fun buildNotification(state: PlayerState): Notification {
        val playPause = if (state.playing) {
            action(R.drawable.ic_pause, R.string.action_pause, ACTION_PAUSE)
        } else {
            action(R.drawable.ic_play, R.string.action_play, ACTION_PLAY)
        }
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_swar)
            .setContentTitle(state.title.ifBlank { getString(R.string.app_name) })
            .setContentText(state.artist.ifBlank { getString(R.string.notification_idle) })
            .setSubText(PlayerBridge.audio.value.ifBlank { null })
            .setLargeIcon(artwork)
            .setContentIntent(openAppIntent())
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setOngoing(true)
            .addAction(action(R.drawable.ic_previous, R.string.action_previous, ACTION_PREVIOUS))
            .addAction(playPause)
            .addAction(action(R.drawable.ic_next, R.string.action_next, ACTION_NEXT))
            .addAction(action(R.drawable.ic_close, R.string.action_close, ACTION_CLOSE))
            .setStyle(
                MediaNotificationCompat.MediaStyle()
                    .setMediaSession(session.sessionToken)
                    .setShowActionsInCompactView(0, 1, 2),
            )
            .build()
    }

    private fun action(icon: Int, title: Int, action: String) =
        NotificationCompat.Action(icon, getString(title), servicePendingIntent(action))

    private fun servicePendingIntent(action: String): PendingIntent = PendingIntent.getService(
        this,
        action.hashCode(),
        Intent(this, PlaybackService::class.java).setAction(action),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    private fun openAppIntent(): PendingIntent = PendingIntent.getActivity(
        this,
        0,
        Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    // ----------------------------------------------------------------- artwork

    private fun loadArtwork(url: String) {
        artworkUrl = url
        artworkJob?.cancel()
        artwork = null
        if (!Artwork.isTrustedUrl(url)) return
        artworkJob = scope.launch {
            val bitmap = withContext(Dispatchers.IO) { fetchBitmap(url) } ?: return@launch
            if (url != artworkUrl) return@launch
            artwork = bitmap
            last?.let {
                session.setMetadata(buildMetadata(it))
                postNotification(it)
            }
        }
    }

    private fun fetchBitmap(url: String): Bitmap? = runCatching {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 8_000
            readTimeout = 8_000
            setRequestProperty("User-Agent", "Swar")
        }
        try {
            conn.inputStream.use { BitmapFactory.decodeStream(it) }
        } finally {
            conn.disconnect()
        }
    }.getOrNull()?.let(::scaleDown)

    private fun scaleDown(bitmap: Bitmap): Bitmap {
        val max = maxOf(bitmap.width, bitmap.height)
        if (max <= ARTWORK_MAX_PX) return bitmap
        val f = ARTWORK_MAX_PX.toFloat() / max
        return Bitmap.createScaledBitmap(bitmap, (bitmap.width * f).toInt(), (bitmap.height * f).toInt(), true)
    }

    // ------------------------------------------------------------------ locks

    private fun acquireLocks() {
        val wake = wakeLock ?: getSystemService(PowerManager::class.java)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Swar:playback")
            .apply { setReferenceCounted(false) }
            .also { wakeLock = it }
        wake.acquire(WAKE_LOCK_TIMEOUT_MS)

        val wifi = wifiLock ?: run {
            @Suppress("DEPRECATION")
            val mode = WifiManager.WIFI_MODE_FULL_HIGH_PERF
            applicationContext.getSystemService(WifiManager::class.java)
                .createWifiLock(mode, "Swar:playback")
                .apply { setReferenceCounted(false) }
                .also { wifiLock = it }
        }
        if (!wifi.isHeld) wifi.acquire()
    }

    private fun releaseLocks() {
        wakeLock?.takeIf { it.isHeld }?.release()
        wifiLock?.takeIf { it.isHeld }?.release()
    }

    // Headphones unplugged / Bluetooth disconnected: pause instead of blasting the speaker.
    private val noisyReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) PlayerBridge.send(PlayerCommand.Pause)
        }
    }

    private fun registerNoisy() {
        if (noisyRegistered) return
        ContextCompat.registerReceiver(
            this, noisyReceiver, IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY), ContextCompat.RECEIVER_NOT_EXPORTED,
        )
        noisyRegistered = true
    }

    private fun unregisterNoisy() {
        if (!noisyRegistered) return
        unregisterReceiver(noisyReceiver)
        noisyRegistered = false
    }

    companion object {
        private const val CHANNEL_ID = "playback"
        private const val NOTIFICATION_ID = 7
        private const val ARTWORK_MAX_PX = 512
        private const val WAKE_LOCK_TIMEOUT_MS = 6 * 60 * 60 * 1000L

        private const val ACTION_PLAY = "com.chinmay.swar.PLAY"
        private const val ACTION_PAUSE = "com.chinmay.swar.PAUSE"
        private const val ACTION_NEXT = "com.chinmay.swar.NEXT"
        private const val ACTION_PREVIOUS = "com.chinmay.swar.PREVIOUS"
        private const val ACTION_CLOSE = "com.chinmay.swar.CLOSE"

        @Volatile
        var running = false
            private set

        /** Starts the service when playback starts. Must be called while the app is visible (Android 12+). */
        fun ensureRunning(context: Context) {
            if (running) return
            try {
                ContextCompat.startForegroundService(context, Intent(context, PlaybackService::class.java))
            } catch (e: IllegalStateException) {
                // Android 12+ refuses foreground-service starts from the background
                // (ForegroundServiceStartNotAllowedException). Playback started while
                // the app is open, which is the normal case, works.
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, PlaybackService::class.java))
        }
    }
}
