package com.chinmay.prahari.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.chinmay.prahari.apps.Labels
import com.chinmay.prahari.core.DnsHit
import com.chinmay.prahari.core.LiveState
import com.chinmay.prahari.data.Db
import com.chinmay.prahari.net.NetUsage
import com.chinmay.prahari.net.TrackerDomains
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private enum class Period(val label: String, val ms: Long) {
    DAY("24 hours", 86_400_000L), WEEK("7 days", 7 * 86_400_000L), MONTH("30 days", 30 * 86_400_000L)
}

private data class NetRow(val pkg: String?, val label: String, val net: NetUsage.AppNet, val minutes: Long)

private data class NetData(val rows: List<NetRow>, val trackers: Map<String, List<DnsHit>>, val bgTotal: Long)

@Composable
fun NetworkScreen(padding: PaddingValues, onOpenApp: (String) -> Unit, onSetup: () -> Unit) {
    val ctx = LocalContext.current
    var period by rememberSaveable { mutableStateOf(Period.WEEK) }
    val rev by LiveState.revision.collectAsState()
    val dnsOn by LiveState.dnsOn.collectAsState()
    val lookups by LiveState.lookups.collectAsState()
    var showLive by rememberSaveable { mutableStateOf(false) }

    val data by produceState<NetData?>(null, period, rev) {
        value = withContext(Dispatchers.IO) {
            val now = System.currentTimeMillis()
            val start = now - period.ms
            val pm = ctx.packageManager
            val minutes = NetUsage.screenMinutes(ctx, start, now)
            val rows = NetUsage.byUid(ctx, start, now).values
                .filter { it.total > 0 }
                .map { n ->
                    val pkg = pm.getPackagesForUid(n.uid)?.firstOrNull()
                    val label = when (n.uid) {
                        -4 -> "Removed apps"
                        -5 -> "Hotspot / tethering"
                        0 -> "Root processes"
                        1000 -> "Android system"
                        else -> pkg?.let { Labels.name(ctx, it) } ?: "uid ${n.uid}"
                    }
                    NetRow(if (n.uid >= 10_000) pkg else null, label, n, pkg?.let { minutes[it] } ?: 0)
                }
                .sortedByDescending { it.net.bgTx }
            val dns = Db.get(ctx).dns(start, limit = 50_000) { TrackerDomains.label(it) }
                .filter { it.tracker != null }
                .groupBy { it.tracker!! }
                .toList().sortedByDescending { (_, hits) -> hits.sumOf { it.count } }.toMap()
            NetData(rows, dns, rows.sumOf { it.net.bgTx })
        }
    }

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = padding.calculateTopPadding() + 8.dp, bottom = padding.calculateBottomPadding() + 24.dp),
    ) {
        block {
            Text("Network", style = MaterialTheme.typography.headlineMedium)
            Text(
                "What each app sent while you weren't using it, and which tracking servers it contacted. Uploads in the background are how logged data leaves the phone.",
                color = P.dim, fontSize = 14.sp,
            )
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { Period.entries.forEach { p -> Chip(p.label, period == p) { period = p } } }
        }

        block {
            SectionLabel("Tracking servers contacted")
            Panel {
                if (!dnsOn && data?.trackers.isNullOrEmpty()) {
                    Text("Turn on DNS watch to see which apps talk to analytics, ads and session-replay servers.", color = P.dim)
                    Spacer(Modifier.height(8.dp))
                    Text("Open Setup", color = P.teal, fontWeight = FontWeight.SemiBold, modifier = Modifier.clickable(onClick = onSetup))
                } else if (data?.trackers.isNullOrEmpty()) {
                    Text("None yet. Lookups appear as apps make them.", color = P.dim)
                } else {
                    data!!.trackers.entries.take(25).forEach { (tracker, hits) ->
                        val apps = hits.mapNotNull { it.pkg }.distinct()
                        Column(Modifier.padding(vertical = 5.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(tracker, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                                Text("${hits.sumOf { it.count }}×", style = Mono)
                            }
                            Text(
                                (if (apps.isEmpty()) "unknown app" else Labels.names(ctx, apps, 3)) +
                                    hits.sumOf { it.bgCount }.let { if (it > 0) " · $it in background" else "" },
                                color = P.dim, fontSize = 13.sp,
                            )
                        }
                    }
                }
            }
        }

        if (dnsOn) {
            block {
                Row(Modifier.fillMaxWidth().padding(top = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                    SectionLabel("Live lookups", Modifier.weight(1f))
                    Chip(if (showLive) "Hide" else "Show", showLive) { showLive = !showLive }
                }
            }
            if (showLive) {
                items(lookups.take(80)) { l ->
                    Row(Modifier.padding(vertical = 4.dp)) {
                        Text(Fmt.time(l.time), style = Mono, modifier = Modifier.width(48.dp))
                        Column(Modifier.weight(1f)) {
                            Text(l.domain, style = Mono.copy(color = if (l.tracker != null) P.red else P.text), maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(
                                listOfNotNull(l.pkg?.let { Labels.name(ctx, it) } ?: "unknown", l.tracker, if (l.background) "background" else null).joinToString(" · "),
                                color = P.dim, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }
            }
        }

        block {
            SectionLabel("Sent in the background")
            data?.let { d ->
                Text("${NetUsage.bytes(d.bgTotal)} uploaded by apps you weren't using", color = P.text, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(6.dp))
            } ?: Text("Reading Android's data counters…", color = P.dim)
        }
        items(data?.rows.orEmpty().take(120), key = { "${it.net.uid}" }) { row ->
            val suspicious = row.net.bgTx > (20L shl 20) && row.minutes < 10
            Row(
                Modifier
                    .fillMaxWidth()
                    .then(if (row.pkg != null) Modifier.clickable { onOpenApp(row.pkg) } else Modifier)
                    .padding(vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                AppIcon(row.pkg, 36.dp)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(row.label, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(
                        "↑ ${NetUsage.bytes(row.net.bgTx)} · ↓ ${NetUsage.bytes(row.net.bgRx)} in background · on screen ${row.minutes} min",
                        color = P.dim, fontSize = 12.sp,
                    )
                }
                if (suspicious) Pill("Odd", P.red)
            }
        }
    }
}
