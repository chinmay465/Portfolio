package com.chinmay.swar

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.chinmay.swar.data.YtMusic
import com.chinmay.swar.playback.SwarPlayer
import com.chinmay.swar.ui.SwarRoot
import com.chinmay.swar.ui.theme.SwarTheme
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.receiveAsFlow

class MainActivity : ComponentActivity() {

    private val links = Channel<Uri>(capacity = 4)
    private val openPlayer = Channel<Unit>(capacity = 2)

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
        )
        super.onCreate(savedInstanceState)

        // Updating from Swar 1.x keeps you signed in.
        YtMusic.account.importWebViewSession()
        SwarPlayer.connect(this)

        setContent {
            SwarTheme { SwarRoot(links.receiveAsFlow(), openPlayer.receiveAsFlow()) }
        }
        handle(intent)
        askForNotificationPermission()
        CrashLog.showIfAny(this)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handle(intent)
    }

    override fun onStart() {
        super.onStart()
        SwarPlayer.connect(this)
    }

    private fun handle(intent: Intent?) {
        intent ?: return
        intent.data?.takeIf { it.scheme == "https" && it.host == "music.youtube.com" }?.let { links.trySend(it) }
        if (intent.getBooleanExtra(EXTRA_OPEN_PLAYER, false)) openPlayer.trySend(Unit)
    }

    /** The playback notification (Android 13+) is what keeps music going in the background. */
    private fun askForNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        }
    }

    companion object {
        const val EXTRA_OPEN_PLAYER = "com.chinmay.swar.OPEN_PLAYER"
    }
}
