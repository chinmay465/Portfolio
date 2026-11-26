package com.chinmay.prahari.ui

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.chinmay.prahari.core.LiveState
import com.chinmay.prahari.data.AppReport
import com.chinmay.prahari.data.Reports
import com.chinmay.prahari.net.NetUsage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun AppDetail(pkg: String, padding: PaddingValues, onBack: () -> Unit) {
    val ctx = LocalContext.current
    val rev by LiveState.revision.collectAsState()
    val report by produceState<AppReport?>(null, pkg, rev) {
        value = withContext(Dispatchers.IO) { Reports.one(ctx, pkg) }
    }
    val now = System.currentTimeMillis()

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = padding.calculateTopPadding(), bottom = padding.calculateBottomPadding() + 32.dp),
    ) {
        block {
            IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") }
        }
        val r = report
        if (r == null) {
            block { Text("Loading…", color = P.dim, modifier = Modifier.padding(16.dp)) }
            return@LazyColumn
        }
        block {
            Row(verticalAlignment = Alignment.CenterVertically) {
                AppIcon(r.app.pkg, 56.dp)
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)) {
                    Text(r.app.label, style = MaterialTheme.typography.titleLarge, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text(r.app.pkg, style = Mono, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text("${r.risk.level.label} risk", color = levelColor(r.risk.level), fontWeight = FontWeight.SemiBold)
                }
                ScoreRing(r.risk.score, r.risk.level, 64.dp)
            }
            Spacer(Modifier.height(14.dp))
            Button(
                onClick = {
                    ctx.startActivity(
                        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${r.app.pkg}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                    )
                },
                colors = ButtonDefaults.buttonColors(containerColor = P.teal, contentColor = P.bg),
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Manage permissions, uninstall") }
        }

        if (r.risk.reasons.isNotEmpty()) {
            block {
                SectionLabel("Why this score")
                Panel { r.risk.reasons.forEach { Bullet("${it.text}  +${it.points}", if (it.behaviour) P.red else P.amber) } }
            }
        }

        block { SectionLabel("What it did · last 7 days") }
        val mine = r.accesses.filter { it.pkg == r.app.pkg }
        val maybe = r.accesses.filter { it.pkg == null }
        if (mine.isEmpty() && maybe.isEmpty()) {
            block { Text("No camera, microphone, location or data access seen.", color = P.dim) }
        }
        items(mine.take(60), key = { "a${it.id}" }) { AccessRow(it, now, null, showApp = false) }
        if (maybe.isNotEmpty()) {
            block { Text("Possibly this app (it was one of the apps that could have):", color = P.dim, fontSize = 13.sp, modifier = Modifier.padding(top = 8.dp)) }
            items(maybe.take(20), key = { "m${it.id}" }) { AccessRow(it, now, null, showApp = false) }
        }

        block {
            SectionLabel("Network · last 7 days")
            Panel {
                val n = r.net
                if (n == null) {
                    Text("No data use recorded (or usage access is off).", color = P.dim)
                } else {
                    Row {
                        Stat(NetUsage.bytes(n.bgTx), "sent in background", if (n.bgTx > 20L shl 20) P.red else P.text)
                        Stat(NetUsage.bytes(n.bgRx), "received in background")
                    }
                    Spacer(Modifier.height(10.dp))
                    Row {
                        Stat(NetUsage.bytes(n.fgTx), "sent while open")
                        Stat("${r.screenMinutes} min", "on screen")
                    }
                }
            }
        }

        if (r.dns.isNotEmpty()) {
            block {
                SectionLabel("Servers it looked up")
                Panel {
                    r.dns.sortedWith(compareByDescending<com.chinmay.prahari.core.DnsHit> { it.tracker != null }.thenByDescending { it.count }).take(40).forEach { h ->
                        Row(Modifier.padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(h.domain, style = Mono.copy(color = if (h.tracker != null) P.red else P.text), maxLines = 1, overflow = TextOverflow.Ellipsis)
                                h.tracker?.let { Text(it, color = P.dim, fontSize = 12.sp) }
                            }
                            Text("${h.count}×" + if (h.bgCount > 0) " · ${h.bgCount} bg" else "", style = Mono)
                        }
                    }
                }
            }
        }

        val e = r.app.exposure
        if (e.any) {
            block {
                SectionLabel("Can see what you type")
                Panel {
                    if (e.defaultKeyboard) Bullet("Your current keyboard: every key you type goes through it", P.red)
                    else if (e.keyboard) Bullet("An enabled keyboard: if you switch to it, it sees every key", P.amber)
                    if (e.readsScreen) Bullet("Accessibility service that reads the screen, including text fields", P.red)
                    else if (e.accessibility) Bullet("Accessibility service", P.amber)
                    if (e.filtersKeys) Bullet("Can intercept key presses", P.red)
                    if (e.notifications) Bullet("Reads all notifications: messages, OTPs, bank alerts", P.red)
                    if (e.autofill) Bullet("Autofill service: sees forms, usernames and passwords you fill", P.amber)
                    if (e.assistant) Bullet("Your assistant app: can read the screen when you invoke it", P.amber)
                    if (e.deviceAdmin) Bullet("Device admin", P.amber)
                }
            }
        }

        block {
            SectionLabel("Trackers built in")
            Panel {
                when {
                    !r.scanned -> Text("Not scanned yet. Open the Apps tab to scan.", color = P.dim)
                    r.trackers.isEmpty() -> Text("No known tracker SDKs found in its code.", color = P.green)
                    else -> r.trackers.groupBy { it.category }.forEach { (cat, sdks) ->
                        Text(cat.label, fontWeight = FontWeight.SemiBold, color = if (cat.weight >= 8) P.red else P.text)
                        Text(sdks.joinToString(", ") { it.name }, color = P.teal, fontSize = 14.sp)
                        Text(cat.explain, color = P.dim, fontSize = 13.sp)
                        Spacer(Modifier.height(10.dp))
                    }
                }
            }
        }

        block {
            SectionLabel("Allowed")
            if (r.app.granted.isEmpty() && r.app.requestedSpecial.isEmpty()) {
                Text("No sensitive permissions granted.", color = P.dim)
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                r.app.granted.sortedByDescending { it.sensitive }.forEach { Pill(it.label, if (it.sensitive >= 6) P.amber else P.teal) }
                r.app.requestedSpecial.forEach { Pill("Asks: ${it.label}", P.faint) }
            }
            Spacer(Modifier.height(8.dp))
            Text("Installed ${Fmt.full(r.app.installedAt)} · updated ${Fmt.full(r.app.updatedAt)}", style = Mono)
        }
    }
}
