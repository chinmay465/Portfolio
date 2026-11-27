package com.chinmay.bachat

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.provider.Settings as SystemSettings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.chinmay.bachat.data.Alerts
import com.chinmay.bachat.data.Repo
import com.chinmay.bachat.data.Scanner
import com.chinmay.bachat.data.Schedule
import com.chinmay.bachat.ui.AlertsScreen
import com.chinmay.bachat.ui.B
import com.chinmay.bachat.ui.BachatTheme
import com.chinmay.bachat.ui.OffersScreen
import com.chinmay.bachat.ui.SourcesScreen
import com.chinmay.bachat.ui.ago
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    private val notificationsOn = MutableStateFlow(false)
    private val askPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) {
        notificationsOn.value = Alerts.allowed(this)
        if (!it) openNotificationSettings()
    }

    private fun openNotificationSettings() {
        startActivity(Intent(SystemSettings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(SystemSettings.EXTRA_APP_PACKAGE, packageName))
    }

    private fun askNotifications() {
        if (Build.VERSION.SDK_INT >= 33) askPermission.launch(Manifest.permission.POST_NOTIFICATIONS) else openNotificationSettings()
    }

    @OptIn(ExperimentalMaterial3Api::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        Repo.init(this)
        notificationsOn.value = Alerts.allowed(this)
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.RESUMED) { notificationsOn.value = Alerts.allowed(this@MainActivity) }
        }
        // First launch: ask once, so alerts can work.
        if (Build.VERSION.SDK_INT >= 33 && !notificationsOn.value && savedInstanceState == null) askPermission.launch(Manifest.permission.POST_NOTIFICATIONS)

        setContent {
            BachatTheme {
                val deals by Repo.deals.collectAsStateWithLifecycle()
                val settings by Repo.settings.collectAsStateWithLifecycle()
                val sources by Repo.sources.collectAsStateWithLifecycle()
                val last by Repo.lastScan.collectAsStateWithLifecycle()
                val scanning by Repo.scanning.collectAsStateWithLifecycle()
                val notifOn by notificationsOn.collectAsStateWithLifecycle()
                var tab by rememberSaveable { mutableStateOf(0) }
                var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
                val scope = rememberCoroutineScope()
                val snack = remember { SnackbarHostState() }

                fun check() = scope.launch {
                    val r = Scanner.run(this@MainActivity)
                    now = System.currentTimeMillis()
                    snack.showSnackbar(
                        buildString {
                            append(if (r.newDeals == 0) "No new offers" else "${r.newDeals} new ${if (r.newDeals == 1) "offer" else "offers"}")
                            if (r.alerts > 0) append(", ${r.alerts} alerted")
                            if (r.failed.isNotEmpty()) append(". Couldn’t reach ${r.failed.joinToString()}")
                        },
                    )
                }

                LaunchedEffect(Unit) {
                    if (System.currentTimeMillis() - Repo.lastScan.value > 8 * 60_000) check()
                    while (true) {
                        delay(30_000)
                        now = System.currentTimeMillis()
                    }
                }

                Scaffold(
                    containerColor = B.bg,
                    snackbarHost = { SnackbarHost(snack) },
                    topBar = {
                        TopAppBar(
                            colors = TopAppBarDefaults.topAppBarColors(containerColor = B.bg),
                            title = {
                                androidx.compose.foundation.layout.Row(verticalAlignment = Alignment.CenterVertically) {
                                    Image(painterResource(R.drawable.logo), null, Modifier.size(40.dp).clip(RoundedCornerShape(11.dp)))
                                    Spacer(Modifier.width(8.dp))
                                    Column {
                                        androidx.compose.foundation.layout.Row(verticalAlignment = Alignment.Bottom) {
                                            Text("Bachat", fontWeight = FontWeight.ExtraBold, fontSize = 19.sp)
                                            Spacer(Modifier.width(6.dp))
                                            Text("बचत", color = B.lime, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                                        }
                                        Text(if (last > 0) "Checked ${ago(last, now)}" else "Offer alerts", fontSize = 12.sp, color = B.muted)
                                    }
                                }
                            },
                            actions = {
                                TextButton(onClick = { check() }, enabled = !scanning) {
                                    if (scanning) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                                    else Icon(Icons.Default.Refresh, null, Modifier.size(18.dp))
                                    Spacer(Modifier.width(6.dp))
                                    Text(if (scanning) "Checking…" else "Check now", color = B.text)
                                }
                            },
                        )
                    },
                    bottomBar = {
                        NavigationBar(containerColor = B.panel) {
                            listOf(
                                Triple("Offers", Icons.Default.ShoppingCart, 0),
                                Triple("Alerts", Icons.Default.Notifications, 1),
                                Triple("Sources", Icons.Default.Search, 2),
                            ).forEach { (label, icon, i) ->
                                NavigationBarItem(
                                    selected = tab == i,
                                    onClick = { tab = i },
                                    icon = { Icon(icon, null) },
                                    label = { Text(label) },
                                    colors = NavigationBarItemDefaults.colors(
                                        selectedIconColor = B.onLime, indicatorColor = B.lime,
                                        selectedTextColor = B.text, unselectedIconColor = B.muted, unselectedTextColor = B.muted,
                                    ),
                                )
                            }
                        }
                    },
                ) { padding ->
                    val save: (com.chinmay.bachat.core.Settings) -> Unit = { s ->
                        val intervalChanged = s.intervalMinutes != settings.intervalMinutes
                        val channelsChanged = s.channels != settings.channels
                        Repo.saveSettings(s)
                        if (intervalChanged) Schedule.apply(this@MainActivity, s.intervalMinutes, replace = true)
                        scope.launch { snack.showSnackbar("Saved") }
                        if (channelsChanged) check()
                    }
                    when (tab) {
                        0 -> OffersScreen(deals, settings, now, scanning, padding)
                        1 -> AlertsScreen(settings, notifOn, padding, ::askNotifications, { Alerts.test(this@MainActivity) }, save)
                        else -> SourcesScreen(sources, settings, now, padding, save)
                    }
                }
            }
        }
    }
}
