package com.chinmay.prahari.watch

import android.Manifest
import android.annotation.SuppressLint
import android.app.KeyguardManager
import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.location.GnssStatus
import android.location.LocationManager
import android.media.AudioManager
import android.media.AudioRecordingConfiguration
import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.chinmay.prahari.MainActivity
import com.chinmay.prahari.PrahariApp
import com.chinmay.prahari.R
import com.chinmay.prahari.apps.Labels
import com.chinmay.prahari.apps.ScanJob
import com.chinmay.prahari.core.Access
import com.chinmay.prahari.core.Attribution
import com.chinmay.prahari.core.Kind
import com.chinmay.prahari.core.LiveState
import com.chinmay.prahari.core.Source
import com.chinmay.prahari.data.Db
import com.chinmay.prahari.data.Prefs

/**
 * The always-on watcher. It costs almost nothing because it never polls:
 * Android calls it when a camera opens or closes, when any app starts or
 * stops recording audio, and when the GPS engine switches on or off. In
 * precision mode it also reads Android's access record when the screen
 * turns on or off, every 15 minutes while the screen is on, and a moment
 * after each camera/mic event. Nothing runs while the screen is off and
 * nothing is happening.
 */
class WatchService : Service() {

    private lateinit var thread: HandlerThread
    private lateinit var h: Handler
    private lateinit var db: Db
    private lateinit var prefs: Prefs
    private lateinit var usage: UsageTracker
    private lateinit var ops: OpsReader
    private lateinit var alerts: Alerts
    private lateinit var power: PowerManager
    private lateinit var keyguard: KeyguardManager

    private class Open(val id: Long, val access: Access, val lockedAtStart: Boolean, var alerted: Boolean = false)

    private val open = HashMap<String, Open>()
    private val torchOn = HashSet<String>()
    private val facing = HashMap<String, String>()
    private var opsSeen: MutableMap<String, Long> = HashMap()
    private var lastOpsPoll = 0L
    private var gnssRegistered = false
    private var locationType = false

    private val camera by lazy { getSystemService(CameraManager::class.java) }
    private val audio by lazy { getSystemService(AudioManager::class.java) }
    private val location by lazy { getSystemService(LocationManager::class.java) }

    // ---------- lifecycle ----------

    override fun onCreate() {
        super.onCreate()
        db = Db.get(this)
        prefs = Prefs(this)
        usage = UsageTracker(this)
        ops = OpsReader(this)
        alerts = Alerts(this)
        power = getSystemService(PowerManager::class.java)
        keyguard = getSystemService(KeyguardManager::class.java)
        thread = HandlerThread("prahari-watch").also { it.start() }
        h = Handler(thread.looper)

        LiveState.serviceStartedAt = System.currentTimeMillis()
        LiveState.cpuAtServiceStart = android.os.Process.getElapsedCpuTime()
        LiveState.watching.value = true

        h.post {
            db.closeDangling(System.currentTimeMillis())
            housekeeping()
            opsSeen = db.opsSeen()
            registerSensors()
            registerReceivers()
            LiveState.precision.value = ops.available()
            pollOps()
            schedulePoll()
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val fromUi = intent?.getBooleanExtra(EXTRA_FROM_UI, false) == true
        goForeground(fromUi)
        if (intent?.action == ACTION_POLL) h.post { pollOps() }
        h.post { registerGnss() }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        LiveState.watching.value = false
        LiveState.gpsWatching.value = false
        LiveState.active.value = emptyList()
        h.removeCallbacksAndMessages(null)
        try {
            camera.unregisterAvailabilityCallback(cameraCallback)
            camera.unregisterTorchCallback(torchCallback)
            audio.unregisterAudioRecordingCallback(recordingCallback)
            if (gnssRegistered) location.unregisterGnssStatusCallback(gnssCallback)
            unregisterReceiver(screenReceiver)
            unregisterReceiver(packageReceiver)
        } catch (_: Exception) {
        }
        val now = System.currentTimeMillis()
        open.values.forEach { db.finish(it.id, now) }
        open.clear()
        thread.quitSafely()
        super.onDestroy()
    }

    private fun goForeground(fromUi: Boolean) {
        val fine = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        // A location-type service may only start while the app is visible; after
        // a reboot it starts without, and GPS watch resumes when the app is next opened.
        val wantLocation = fine && (fromUi || locationType)
        val n = buildNotification()
        if (Build.VERSION.SDK_INT >= 34) {
            val base = ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
            try {
                ServiceCompat.startForeground(this, NOTIFICATION_ID, n, if (wantLocation) base or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION else base)
                locationType = wantLocation
            } catch (e: Exception) {
                Log.w(TAG, "location-type start refused, watching without GPS: $e")
                ServiceCompat.startForeground(this, NOTIFICATION_ID, n, base)
                locationType = false
            }
        } else {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MANIFEST)
            locationType = fine
        }
    }

    // ---------- sensors ----------

    private val cameraCallback = object : CameraManager.AvailabilityCallback() {
        override fun onCameraUnavailable(cameraId: String) {
            // Only ids and states are logged, never app names: other apps with log access could read them.
            Log.i(TAG, "camera $cameraId busy (torch=${cameraId in torchOn})")
            if (cameraId in torchOn) return
            start(Kind.CAMERA, "cam:$cameraId", facingOf(cameraId))
        }

        override fun onCameraAvailable(cameraId: String) {
            Log.i(TAG, "camera $cameraId free")
            end("cam:$cameraId")
        }
    }

    private val torchCallback = object : CameraManager.TorchCallback() {
        override fun onTorchModeChanged(cameraId: String, enabled: Boolean) {
            if (enabled) {
                torchOn += cameraId
                // The flashlight can briefly mark the camera busy: that isn't a camera use.
                open["cam:$cameraId"]?.let {
                    if (System.currentTimeMillis() - it.access.start < 3_000) {
                        db.delete(it.id)
                        open.remove("cam:$cameraId")
                        publish()
                    }
                }
            } else {
                torchOn -= cameraId
            }
        }
    }

    private val recordingCallback = object : AudioManager.AudioRecordingCallback() {
        override fun onRecordingConfigChanged(configs: MutableList<AudioRecordingConfiguration>) = syncMic(configs)
    }

    private val gnssCallback = object : GnssStatus.Callback() {
        override fun onStarted() = start(Kind.GPS, "gps", null)
        override fun onStopped() = end("gps")
    }

    private fun registerSensors() {
        try {
            camera.registerTorchCallback(torchCallback, h)
            camera.registerAvailabilityCallback(cameraCallback, h)
        } catch (e: Exception) {
            Log.w(TAG, "camera watch unavailable: $e")
        }
        audio.registerAudioRecordingCallback(recordingCallback, h)
        syncMic(audio.activeRecordingConfigurations)
    }

    @SuppressLint("MissingPermission")
    private fun registerGnss() {
        if (gnssRegistered || !locationType) return
        try {
            gnssRegistered = if (Build.VERSION.SDK_INT >= 30) {
                location.registerGnssStatusCallback(java.util.concurrent.Executor { r -> h.post(r) }, gnssCallback)
            } else {
                @Suppress("DEPRECATION")
                location.registerGnssStatusCallback(gnssCallback, h)
            }
        } catch (e: SecurityException) {
            gnssRegistered = false
        }
        LiveState.gpsWatching.value = gnssRegistered
    }

    private fun syncMic(configs: List<AudioRecordingConfiguration>) {
        val live = configs.associateBy { "mic:${it.clientAudioSessionId}:${it.clientAudioSource}" }
        for ((key, c) in live) {
            if (key !in open) {
                val silenced = Build.VERSION.SDK_INT >= 29 && c.isClientSilenced
                start(Kind.MIC, key, sourceLabel(c.clientAudioSource) + if (silenced) " · silenced by Android" else "")
            }
        }
        open.keys.filter { it.startsWith("mic:") && it !in live }.forEach { end(it) }
    }

    // ---------- sessions ----------

    private fun start(kind: Kind, key: String, detail: String?) {
        if (key in open) return
        val now = System.currentTimeMillis()
        val screenOff = !power.isInteractive
        val u = usage.now()
        val pm = packageManager
        val r = Attribution.attribute(
            foreground = u.foreground,
            screenOff = screenOff,
            services = u.services,
            holds = { pkg -> kind.perms.any { pm.checkPermission(it, pkg) == PackageManager.PERMISSION_GRANTED } },
            ignore = setOf(packageName),
        )
        val locked = keyguard.isKeyguardLocked
        val a = Access(
            kind = kind, pkg = r.pkg, candidates = r.candidates, start = now, end = null,
            screenOff = screenOff, background = r.background, source = Source.LIVE,
            detail = listOfNotNull(detail, if (locked && kind == Kind.CAMERA && r.pkg == null) "phone locked (face unlock?)" else null)
                .joinToString(" · ").ifEmpty { null },
        )
        val id = db.insert(a)
        Log.i(
            TAG,
            "session ${kind.id} started: attributed=${r.pkg != null} candidates=${r.candidates.size} background=${r.background} " +
                "foregroundKnown=${u.foreground != null} services=${u.services.size}",
        )
        open[key] = Open(id, a, locked)
        publish()
        LiveState.bump()

        // Check Android's own record (precision mode) and alert once the use has lasted a moment.
        h.postDelayed({
            val o = open[key] ?: return@postDelayed
            if (o.id != id) return@postDelayed
            val current = refineFromOps(key, o) ?: o.access
            maybeAlert(o, current)
        }, ALERT_DELAY_MS)
    }

    private fun end(key: String) {
        val o = open.remove(key) ?: return
        val now = System.currentTimeMillis()
        val brief = now - o.access.start < BRIEF_MS
        // Brief uses are kept: a silent snapshot can take a few hundred milliseconds.
        db.finish(o.id, now, if (brief) listOfNotNull(o.access.detail, "brief").joinToString(" · ") else null)
        var done = o.access.copy(end = now)
        if (o.access.source != Source.OPS) refineFromOps(key, o, ended = true)?.let { done = it.copy(end = now) }
        if (!o.alerted) maybeAlert(o, done)
        publish()
        LiveState.bump()
    }

    private fun maybeAlert(o: Open, a: Access) {
        if (o.alerted) return
        // The lock screen's own camera use (face unlock) has no app behind it.
        if (o.lockedAtStart && a.pkg == null && a.kind == Kind.CAMERA) return
        if (alerts.shouldAlert(a)) {
            alerts.post(a)
            o.alerted = true
        }
    }

    /**
     * With precision mode, Android's own record says exactly which app held
     * the camera or mic. Replace the guess with that.
     */
    private fun refineFromOps(key: String, o: Open, ended: Boolean = false): Access? {
        if (!ops.granted()) return null
        val kind = o.access.kind
        if (kind != Kind.CAMERA && kind != Kind.MIC) return null
        val users = ops.read()
            .filter { it.kind == kind && it.pkg != packageName && (it.running || it.last >= o.access.start - 2_000) }
            .sortedByDescending { it.running }
            .map { it.pkg }
            .distinct()
        if (users.isEmpty()) return null
        val fg = usage.now().foreground
        val pkg = users.firstOrNull { it == fg } ?: users.first()
        val background = o.access.screenOff || pkg != fg
        val refined = o.access.copy(pkg = pkg, candidates = users, background = background, source = Source.OPS)
        db.reattribute(o.id, pkg, users, background)
        if (!ended) open[key] = Open(o.id, refined, o.lockedAtStart, o.alerted)
        val now = System.currentTimeMillis()
        users.forEach { p ->
            opsKeysFor(kind).forEach { op ->
                opsSeen["$p|$op"] = now
                db.setOpSeen(p, op, now)
            }
        }
        publish()
        LiveState.bump()
        return refined
    }

    private fun publish() {
        LiveState.active.value = open.map { (key, o) ->
            LiveState.Active(key, o.access.kind, o.access.pkg, o.access.candidates, o.access.start, o.access.background)
        }
        notifyStatus()
    }

    // ---------- precision mode ----------

    private val pollRunnable = Runnable {
        pollOps()
        schedulePoll()
    }

    private fun schedulePoll() {
        h.removeCallbacks(pollRunnable)
        if (power.isInteractive && ops.granted()) h.postDelayed(pollRunnable, POLL_MS)
    }

    private fun pollOps() {
        val now = System.currentTimeMillis()
        if (!ops.granted()) {
            LiveState.precision.value = false
            return
        }
        val uses = ops.read()
        LiveState.precision.value = uses.isNotEmpty() || ops.available()
        if (uses.isEmpty()) return
        val retention = now - prefs.retentionDays * DAY
        val historyFrom = maxOf(retention, if (lastOpsPoll == 0L) now - DAY else lastOpsPoll - 5 * 60_000)
        val history = usage.history(historyFrom, now)
        val ime = currentIme()
        var added = 0
        for (u in uses) {
            if (u.pkg == packageName) continue
            val k = "${u.pkg}|${u.op}"
            val seen = opsSeen[k] ?: 0L
            if (u.last <= seen) continue
            opsSeen[k] = u.last
            db.setOpSeen(u.pkg, u.op, u.last)
            if (u.last < retention) continue
            // Camera and mic sessions seen live are already on the timeline.
            if ((u.kind == Kind.CAMERA || u.kind == Kind.MIC) && db.hasNear(u.kind, u.pkg, u.last, 90_000)) continue
            val fgThen = history.foregroundAt(u.last)
            val offThen = history.screenOffAt(u.last)
            val a = Access(
                kind = u.kind, pkg = u.pkg, candidates = listOf(u.pkg),
                start = u.last, end = if (u.running) null else u.last + u.duration,
                screenOff = offThen, background = offThen || fgThen != u.pkg,
                source = Source.OPS,
                detail = listOfNotNull(
                    OP_LABELS[u.op],
                    if (u.kind == Kind.CLIPBOARD && u.pkg == ime) "your keyboard" else null,
                ).joinToString(" · ").ifEmpty { null },
            )
            db.insert(a)
            added++
            val fresh = now - u.last < POLL_MS + 60_000
            if (fresh && a.kind == Kind.CLIPBOARD && u.pkg != ime && alerts.shouldAlert(a)) alerts.post(a)
        }
        lastOpsPoll = now
        if (added > 0) LiveState.bump()
    }

    private fun currentIme(): String? = try {
        android.provider.Settings.Secure.getString(contentResolver, android.provider.Settings.Secure.DEFAULT_INPUT_METHOD)
            ?.substringBefore('/')
    } catch (_: Exception) {
        null
    }

    // ---------- receivers ----------

    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            h.post {
                pollOps()
                schedulePoll()
                if (intent.action == Intent.ACTION_SCREEN_OFF) housekeeping()
            }
        }
    }

    private val packageReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val pkg = intent.data?.schemeSpecificPart ?: return
            if (intent.action == Intent.ACTION_PACKAGE_REMOVED && !intent.getBooleanExtra(Intent.EXTRA_REPLACING, false)) return
            ScanJob.scheduleOne(context, pkg)
        }
    }

    private fun registerReceivers() {
        // System broadcasts only, so nothing outside Android can poke these receivers.
        ContextCompat.registerReceiver(
            this,
            screenReceiver,
            IntentFilter().apply {
                addAction(Intent.ACTION_SCREEN_ON)
                addAction(Intent.ACTION_SCREEN_OFF)
            },
            ContextCompat.RECEIVER_NOT_EXPORTED,
        )
        ContextCompat.registerReceiver(
            this,
            packageReceiver,
            IntentFilter().apply {
                addAction(Intent.ACTION_PACKAGE_ADDED)
                addAction(Intent.ACTION_PACKAGE_REPLACED)
                addDataScheme("package")
            },
            ContextCompat.RECEIVER_NOT_EXPORTED,
        )
    }

    private fun housekeeping() {
        val now = System.currentTimeMillis()
        if (now - prefs.lastPrune < DAY) return
        db.prune(now - prefs.retentionDays * DAY)
        prefs.lastPrune = now
    }

    // ---------- notification ----------

    private fun buildNotification(): Notification {
        val active = LiveState.active.value
        val text = if (active.isEmpty()) {
            "Camera, mic" + (if (locationType) " and GPS" else "") + " idle"
        } else {
            active.joinToString(" · ") { "${it.kind.label}: ${it.pkg?.let { p -> Labels.name(this, p) } ?: "unknown app"}" }
        }
        val open = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        return NotificationCompat.Builder(this, PrahariApp.CH_WATCH)
            .setSmallIcon(R.drawable.ic_stat_watch)
            .setContentTitle(if (active.isEmpty()) "Prahari is watching" else "In use now")
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setContentIntent(open)
            .build()
    }

    private fun notifyStatus() {
        try {
            getSystemService(android.app.NotificationManager::class.java).notify(NOTIFICATION_ID, buildNotification())
        } catch (_: Exception) {
        }
    }

    // ---------- helpers ----------

    private fun facingOf(id: String): String = facing.getOrPut(id) {
        try {
            when (camera.getCameraCharacteristics(id).get(CameraCharacteristics.LENS_FACING)) {
                CameraCharacteristics.LENS_FACING_FRONT -> "front camera"
                CameraCharacteristics.LENS_FACING_BACK -> "back camera"
                else -> "external camera"
            }
        } catch (_: Exception) {
            "camera $id"
        }
    }

    private fun sourceLabel(src: Int): String = when (src) {
        MediaRecorder.AudioSource.MIC -> "microphone"
        MediaRecorder.AudioSource.CAMCORDER -> "video recording"
        MediaRecorder.AudioSource.VOICE_RECOGNITION -> "voice recognition"
        MediaRecorder.AudioSource.VOICE_COMMUNICATION -> "call / voice chat"
        MediaRecorder.AudioSource.VOICE_CALL, MediaRecorder.AudioSource.VOICE_UPLINK, MediaRecorder.AudioSource.VOICE_DOWNLINK -> "phone call audio"
        MediaRecorder.AudioSource.UNPROCESSED -> "raw microphone"
        MediaRecorder.AudioSource.VOICE_PERFORMANCE -> "live performance"
        1999 -> "hotword (\"Hey Google\"-style listening)"
        else -> "audio source $src"
    }

    private fun opsKeysFor(kind: Kind) = OpsReader.OPS.filterValues { it == kind }.keys

    companion object {
        private const val TAG = "PrahariWatch"
        private const val NOTIFICATION_ID = 7
        private const val EXTRA_FROM_UI = "from_ui"
        private const val ACTION_POLL = "com.chinmay.prahari.POLL"
        private const val DAY = 24 * 60 * 60 * 1000L
        private const val POLL_MS = 15 * 60_000L
        private const val ALERT_DELAY_MS = 3_000L
        private const val BRIEF_MS = 1_000L

        private val OP_LABELS = mapOf(
            "android:phone_call_camera" to "during a call",
            "android:phone_call_microphone" to "during a call",
            "android:fine_location" to "precise",
            "android:coarse_location" to "approximate",
            "android:receive_sms" to "incoming SMS",
            "android:read_phone_numbers" to "phone number",
        )

        fun start(ctx: Context, fromUi: Boolean) {
            if (!Prefs(ctx).watching) return
            ContextCompat.startForegroundService(ctx, Intent(ctx, WatchService::class.java).putExtra(EXTRA_FROM_UI, fromUi))
        }

        /** Ask the running watcher to read the access record now (precision mode). */
        fun pollNow(ctx: Context) {
            if (!LiveState.watching.value) return
            ctx.startService(Intent(ctx, WatchService::class.java).setAction(ACTION_POLL))
        }

        fun stop(ctx: Context) {
            ctx.stopService(Intent(ctx, WatchService::class.java))
        }
    }
}
