package com.chinmay.prahari.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.net.VpnService
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.chinmay.prahari.canary.Canary
import com.chinmay.prahari.core.LiveState
import com.chinmay.prahari.data.Db
import com.chinmay.prahari.data.Prefs
import com.chinmay.prahari.net.DnsWatchService
import com.chinmay.prahari.watch.OpsReader
import com.chinmay.prahari.watch.UsageTracker
import com.chinmay.prahari.watch.WatchService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

@Composable
fun SetupScreen(padding: PaddingValues, resumeTick: Int) {
    val ctx = LocalContext.current
    val prefs = remember { Prefs(ctx) }
    var tick by remember { mutableIntStateOf(0) }
    val refresh = { tick++ }
    val watching by LiveState.watching.collectAsState()
    val dnsOn by LiveState.dnsOn.collectAsState()
    val dnsError by LiveState.dnsError.collectAsState()
    val precision by LiveState.precision.collectAsState()
    val gps by LiveState.gpsWatching.collectAsState()

    val usage = remember(tick, resumeTick) { UsageTracker.hasUsageAccess(ctx) }
    val notif = remember(tick, resumeTick) {
        Build.VERSION.SDK_INT < 33 || ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    }
    val fine = remember(tick, resumeTick) { ctx.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED }
    val opsGranted = remember(tick, resumeTick) { ctx.checkSelfPermission(OpsReader.PERMISSION) == PackageManager.PERMISSION_GRANTED }
    val logs = remember(tick, resumeTick) { Canary.canReadLogs(ctx) }

    val askNotif = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { refresh() }
    val askLocation = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        refresh()
        WatchService.start(ctx, fromUi = true)
    }
    val askVpn = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        if (res.resultCode == android.app.Activity.RESULT_OK) {
            prefs.dnsWatch = true
            DnsWatchService.start(ctx)
        }
        refresh()
    }

    // Prahari's own cost, refreshed every few seconds while this screen is open.
    var cpuTick by remember { mutableIntStateOf(0) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(5_000)
            cpuTick++
        }
    }
    val counts by produceState(0L to 0L, tick, cpuTick) { value = withContext(Dispatchers.IO) { Db.get(ctx).counts() } }

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = padding.calculateTopPadding() + 8.dp, bottom = padding.calculateBottomPadding() + 32.dp),
    ) {
        block {
            Text("Setup", style = MaterialTheme.typography.headlineMedium)
            Text("Everything Prahari records stays on this phone. It has no account, no analytics and no server.", color = P.dim, fontSize = 14.sp)
        }

        block {
            SectionLabel("Watching")
            Panel {
                SettingRow("Watch camera, mic and GPS", "Runs all the time with a silent notification. Event-driven: it sleeps until Android reports a change.", watching) { on ->
                    prefs.watching = on
                    if (on) WatchService.start(ctx, fromUi = true) else WatchService.stop(ctx)
                }
                Step(
                    done = usage,
                    title = "Usage access",
                    body = "Names the app behind each use, tells background from foreground, and reads per-app data use.",
                    action = "Allow",
                ) { ctx.startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                Step(done = notif, title = "Notifications", body = "Alerts when an app uses the camera, mic or clipboard behind your back.", action = "Allow") {
                    if (Build.VERSION.SDK_INT >= 33) askNotif.launch(Manifest.permission.POST_NOTIFICATIONS)
                }
                Step(
                    done = fine && gps,
                    title = "GPS watch",
                    body = if (fine && !gps) "Allowed. Open Prahari once after a reboot to resume GPS watch." else "Hears when any app switches the GPS on. Prahari never asks for your location itself.",
                    action = "Allow",
                ) {
                    if (fine) WatchService.start(ctx, fromUi = true)
                    else askLocation.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
                }
                Step(
                    done = false,
                    title = "Battery",
                    body = "Some phones (Samsung, Xiaomi, OnePlus) put background apps to sleep. Set Prahari to Unrestricted so it keeps watching.",
                    action = "Open",
                    neutral = true,
                ) {
                    ctx.startActivity(
                        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${ctx.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                    )
                }
            }
        }

        block {
            SectionLabel("Precision mode · exact app and time")
            Panel {
                Text(
                    if (precision) "On. Prahari reads Android's own access record: camera, mic, location, clipboard, contacts, SMS, call log, calendar, sensors and more, with the exact app and time."
                    else if (opsGranted) "Granted, but this Android build didn't answer. Live watch still works."
                    else "Android keeps an exact record of which app touched what and when, but only shares it with apps granted access from a computer. Run this once with USB debugging on:",
                    color = if (precision) P.green else P.dim, fontSize = 13.sp,
                )
                if (!opsGranted) CommandBox(OpsReader.ADB_GRANT)
                if (!logs) {
                    Spacer(Modifier.height(8.dp))
                    Text("For the canary test (does an app log what you type?):", color = P.dim, fontSize = 13.sp)
                    CommandBox(Canary.ADB_GRANT)
                }
                Spacer(Modifier.height(6.dp))
                Text(
                    "Both are read-only, change nothing on the phone and disappear when Prahari is uninstalled. Log access is broad (every app's log), so revoke it once you're done with canary tests:",
                    color = P.faint, fontSize = 12.sp,
                )
                if (logs) CommandBox(Canary.ADB_REVOKE)
                if (opsGranted) CommandBox(OpsReader.ADB_REVOKE)
                if (opsGranted) {
                    Spacer(Modifier.height(8.dp))
                    OutlinedButton(onClick = { WatchService.pollNow(ctx); refresh() }) { Text("Read access record now") }
                }
            }
        }

        block {
            SectionLabel("DNS watch · who talks to which servers")
            Panel {
                SettingRow(
                    "DNS watch",
                    "A local VPN that sees only DNS lookups, so it can tell which app contacts analytics, ads and session-replay servers. Other traffic never passes through it. Android allows one VPN at a time, so it can't run alongside Kavach or a work VPN.",
                    dnsOn,
                ) { on ->
                    if (on) {
                        val intent = VpnService.prepare(ctx)
                        if (intent != null) askVpn.launch(intent) else {
                            prefs.dnsWatch = true
                            DnsWatchService.start(ctx)
                        }
                    } else {
                        prefs.dnsWatch = false
                        DnsWatchService.stop(ctx)
                    }
                }
                dnsError?.let { Text(it, color = P.amber, fontSize = 13.sp) }
                Text(
                    "Apps with their own encrypted DNS (Chrome's Secure DNS, or Private DNS set to a hostname) skip it.",
                    color = P.faint, fontSize = 12.sp,
                )
            }
        }

        block {
            SectionLabel("Alerts")
            Panel {
                SettingRow("Alert on background use", "Camera or mic used while the app isn't on screen; clipboard read in the background.", prefs.alerts.also { tick }) {
                    prefs.alerts = it
                    refresh()
                }
                SettingRow("Also alert for the app on screen", "Noisy: video calls and camera apps will alert too.", prefs.alertForeground.also { tick }) {
                    prefs.alertForeground = it
                    refresh()
                }
            }
        }

        block {
            SectionLabel("Data")
            Panel {
                SettingRow("Include preinstalled apps", "Show system apps in the Apps list and scan them for trackers.", prefs.includeSystem.also { tick }) {
                    prefs.includeSystem = it
                    refresh()
                }
                Text("Keep history for", fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(vertical = 8.dp)) {
                    listOf(7, 14, 30).forEach { d ->
                        Chip("$d days", prefs.retentionDays.also { tick } == d) {
                            prefs.retentionDays = d
                            prefs.lastPrune = 0
                            refresh()
                        }
                    }
                }
                Text("${counts.first} uses and ${counts.second} app–server pairs recorded", style = Mono)
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = {
                        Db.get(ctx).clearHistory()
                        LiveState.bump()
                        refresh()
                    }) { Text("Clear history") }
                    if (Build.VERSION.SDK_INT >= 31) {
                        OutlinedButton(onClick = {
                            val i = Intent("android.intent.action.REVIEW_PERMISSION_USAGE").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            try {
                                ctx.startActivity(i)
                            } catch (_: Exception) {
                                ctx.startActivity(Intent(Settings.ACTION_PRIVACY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                            }
                        }) { Text("Android's privacy dashboard") }
                    }
                }
            }
        }

        block {
            SectionLabel("What watching costs")
            Panel {
                val started = LiveState.serviceStartedAt
                cpuTick.let { }
                if (!watching || started == 0L) {
                    Text("Not running.", color = P.dim)
                } else {
                    val cpuMs = android.os.Process.getElapsedCpuTime() - LiveState.cpuAtServiceStart
                    val hours = ((System.currentTimeMillis() - started) / 3_600_000.0).coerceAtLeast(1 / 60.0)
                    Row {
                        Stat("${cpuMs / 1000}.${(cpuMs % 1000) / 100} s", "CPU since start", P.teal)
                        Stat(String.format(java.util.Locale.US, "%.1f s/h", cpuMs / 1000.0 / hours), "average")
                    }
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Includes the time this screen is open. No wake locks, no alarms, no location requests, no polling while the screen is off. Tracker scans run once per app version, while charging or when you open Apps.",
                        color = P.dim, fontSize = 13.sp,
                    )
                }
            }
        }

        block {
            SectionLabel("What no app can see")
            Panel {
                Bullet("The contents of what an app sends. Searches and messages leave encrypted (HTTPS); reading them needs root. Prahari shows who receives your keystrokes, who logs them, which tracking servers each app calls and how much it uploads in the background.")
                Bullet("Which app is behind a camera or mic use is a strong guess without precision mode; with it, it's Android's own record.")
                Bullet("Location from Wi-Fi and cell towers needs precision mode; live watch hears only the GPS engine.")
            }
        }
    }
}

@Composable
private fun Step(done: Boolean, title: String, body: String, action: String, neutral: Boolean = false, onClick: () -> Unit) {
    Row(Modifier.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(title, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.padding(start = 8.dp))
                if (!neutral) Pill(if (done) "On" else "Off", if (done) P.green else P.amber)
            }
            Text(body, color = P.dim, fontSize = 13.sp)
        }
        if (!done) {
            Spacer(Modifier.padding(start = 8.dp))
            OutlinedButton(onClick = onClick) { Text(action) }
        }
    }
}
