package com.chinmay.prahari

import android.net.VpnService
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import com.chinmay.prahari.apps.ScanJob
import com.chinmay.prahari.core.LiveState
import com.chinmay.prahari.data.Prefs
import com.chinmay.prahari.net.DnsWatchService
import com.chinmay.prahari.ui.AppDetail
import com.chinmay.prahari.ui.AppsScreen
import com.chinmay.prahari.ui.LiveScreen
import com.chinmay.prahari.ui.NetworkScreen
import com.chinmay.prahari.ui.P
import com.chinmay.prahari.ui.PrahariTheme
import com.chinmay.prahari.ui.SetupScreen
import com.chinmay.prahari.ui.TypingScreen
import com.chinmay.prahari.watch.UsageTracker
import com.chinmay.prahari.watch.WatchService

class MainActivity : ComponentActivity() {
    private var resumeTick by mutableIntStateOf(0)

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        ScanJob.schedulePeriodic(this)
        setContent { PrahariTheme { Root(resumeTick) } }
    }

    override fun onResume() {
        super.onResume()
        resumeTick++
        // Opening the app is the moment Android allows the GPS-capable watcher to start.
        WatchService.start(this, fromUi = true)
        val prefs = Prefs(this)
        if (prefs.dnsWatch && !LiveState.dnsOn.value && VpnService.prepare(this) == null) DnsWatchService.start(this)
    }
}

private enum class Tab(val label: String, val icon: ImageVector) {
    LIVE("Live", Icons.Filled.Home),
    APPS("Apps", Icons.AutoMirrored.Filled.List),
    NETWORK("Network", Icons.Filled.Share),
    TYPING("Typing", Icons.Filled.Edit),
    SETUP("Setup", Icons.Filled.Settings),
}

@Composable
private fun Root(resumeTick: Int) {
    val ctx = LocalContext.current
    var tab by rememberSaveable { mutableStateOf(Tab.LIVE) }
    var detail by rememberSaveable { mutableStateOf<String?>(null) }
    val setupNeeded = remember(resumeTick) { !UsageTracker.hasUsageAccess(ctx) }

    BackHandler(enabled = detail != null) { detail = null }
    BackHandler(enabled = detail == null && tab != Tab.LIVE) { tab = Tab.LIVE }

    Scaffold(
        containerColor = P.bg,
        bottomBar = {
            NavigationBar(containerColor = P.surface) {
                Tab.entries.forEach { t ->
                    NavigationBarItem(
                        selected = tab == t && detail == null,
                        onClick = {
                            tab = t
                            detail = null
                        },
                        icon = { Icon(t.icon, contentDescription = null) },
                        label = { Text(t.label) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = P.bg,
                            indicatorColor = P.teal,
                            selectedTextColor = P.teal,
                            unselectedIconColor = P.dim,
                            unselectedTextColor = P.dim,
                        ),
                    )
                }
            }
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().background(P.bg)) {
            val open: (String) -> Unit = { detail = it }
            val d = detail
            if (d != null) {
                AppDetail(d, padding) { detail = null }
            } else {
                when (tab) {
                    Tab.LIVE -> LiveScreen(padding, setupNeeded, onSetup = { tab = Tab.SETUP }, onOpenApp = open)
                    Tab.APPS -> AppsScreen(padding, open)
                    Tab.NETWORK -> NetworkScreen(padding, open, onSetup = { tab = Tab.SETUP })
                    Tab.TYPING -> TypingScreen(padding, open)
                    Tab.SETUP -> SetupScreen(padding, resumeTick)
                }
            }
        }
    }
}
