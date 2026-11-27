package com.chinmay.prahari.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
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
import com.chinmay.prahari.core.Access
import com.chinmay.prahari.core.Confidence
import com.chinmay.prahari.core.Kind
import com.chinmay.prahari.core.LiveState
import com.chinmay.prahari.data.Db
import com.chinmay.prahari.data.Prefs
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

private enum class Filter(val label: String, val kinds: Set<Kind>?) {
    ALL("All", null),
    CAMERA("Camera", setOf(Kind.CAMERA)),
    MIC("Mic", setOf(Kind.MIC)),
    LOCATION("Location", setOf(Kind.GPS, Kind.LOCATION)),
    CLIPBOARD("Clipboard", setOf(Kind.CLIPBOARD)),
    DATA("Contacts & SMS", setOf(Kind.CONTACTS, Kind.SMS, Kind.CALL_LOG, Kind.CALENDAR, Kind.PHONE, Kind.ACCOUNTS)),
}

@Composable
fun LiveScreen(padding: PaddingValues, setupNeeded: Boolean, onSetup: () -> Unit, onOpenApp: (String) -> Unit) {
    val ctx = LocalContext.current
    val watching by LiveState.watching.collectAsState()
    val active by LiveState.active.collectAsState()
    val gps by LiveState.gpsWatching.collectAsState()
    val precision by LiveState.precision.collectAsState()
    val rev by LiveState.revision.collectAsState()
    var filter by rememberSaveable { mutableStateOf(Filter.ALL) }
    var bgOnly by rememberSaveable { mutableStateOf(false) }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(active.isNotEmpty()) {
        while (active.isNotEmpty()) {
            now = System.currentTimeMillis()
            delay(1_000)
        }
    }

    val rows by produceState(emptyList<Access>(), rev, filter, bgOnly) {
        value = withContext(Dispatchers.IO) {
            val prefs = Prefs(ctx)
            val since = System.currentTimeMillis() - prefs.retentionDays * 86_400_000L
            Db.get(ctx).accesses(since, limit = 1500)
                .filter { filter.kinds == null || it.kind in filter.kinds!! }
                .filter { !bgOnly || it.background }
                .filter { prefs.includeSystem || it.source == com.chinmay.prahari.core.Source.LIVE || !Labels.isPlumbing(ctx, it.pkg) }
        }
    }

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = padding.calculateTopPadding() + 8.dp, bottom = padding.calculateBottomPadding() + 24.dp),
    ) {
        block {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Prahari", style = MaterialTheme.typography.headlineMedium)
                    Text(
                        when {
                            !watching -> "Not watching"
                            active.isNotEmpty() -> "${active.size} in use right now"
                            else -> "Watching · all quiet"
                        },
                        color = if (active.isNotEmpty()) P.amber else if (watching) P.teal else P.dim,
                        fontSize = 14.sp,
                    )
                    Spacer(Modifier.height(6.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        if (precision) Pill("Precision", P.violet)
                        if (!gps && watching) Pill("GPS off", P.faint)
                    }
                }
                Radar(active.map { it.kind }, watching, Modifier.size(124.dp))
            }
        }
        if (setupNeeded) {
            block {
                Spacer(Modifier.height(12.dp))
                Panel(onClick = onSetup) {
                    Text("Finish setup", color = P.amber, fontWeight = FontWeight.SemiBold)
                    Text("Usage access lets Prahari name the app behind each camera, mic and GPS use. Tap to set up.", color = P.dim, fontSize = 13.sp)
                }
            }
        }
        block {
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                for (k in Kind.LIVE) {
                    val a = active.firstOrNull { it.kind == k }
                    Box(Modifier.weight(1f)) {
                        Panel(onClick = a?.pkg?.let { p -> { onOpenApp(p) } }) {
                            KindBadge(k, 34.dp, live = a != null)
                            Spacer(Modifier.height(8.dp))
                            Text(if (k == Kind.MIC) "Mic" else k.label, fontSize = 12.sp, color = P.dim, maxLines = 1)
                            Text(
                                when {
                                    a != null -> a.pkg?.let { Labels.name(ctx, it) } ?: if (a.candidates.isEmpty()) "Unknown" else Labels.names(ctx, a.candidates, 1)
                                    k == Kind.GPS && !gps -> "Not watched"
                                    else -> "Idle"
                                },
                                fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis,
                                color = if (a != null) P.kind(k) else P.text,
                            )
                            if (a != null) Text(Fmt.duration(now - a.since), style = Mono)
                        }
                    }
                }
            }
        }
        block {
            SectionLabel("Timeline")
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Filter.entries.forEach { f -> Chip(f.label, filter == f) { filter = f } }
                Chip("Background only", bgOnly) { bgOnly = !bgOnly }
            }
            Spacer(Modifier.height(8.dp))
        }
        if (rows.isEmpty()) {
            block {
                Text(
                    if (watching) "Nothing yet. Every camera, microphone and GPS use from now on shows up here." else "Turn watching on in Setup.",
                    color = P.dim, modifier = Modifier.padding(vertical = 24.dp),
                )
            }
        }
        rows.groupBy { Fmt.day(it.start) }.forEach { (d, list) ->
            item(key = "day-$d") { Text(d, style = Mono.copy(color = P.faint), modifier = Modifier.padding(top = 14.dp, bottom = 6.dp)) }
            items(list, key = { it.id }) { a -> AccessRow(a, now, onOpenApp) }
        }
    }
}

@Composable
fun AccessRow(a: Access, now: Long, onOpenApp: ((String) -> Unit)?, showApp: Boolean = true) {
    val ctx = LocalContext.current
    Row(
        Modifier
            .fillMaxWidth()
            .then(if (onOpenApp != null && a.pkg != null) Modifier.clickable { onOpenApp(a.pkg) } else Modifier)
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        KindBadge(a.kind, 38.dp, live = a.running)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            val who = when {
                !showApp -> a.kind.label
                a.pkg != null -> Labels.name(ctx, a.pkg)
                a.candidates.isNotEmpty() -> "One of " + Labels.names(ctx, a.candidates)
                else -> "Unknown app"
            }
            Text(who, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            val span = if (a.end != null && a.end - a.start > 1_000) "${Fmt.time(a.start)}–${Fmt.time(a.end)}" else Fmt.time(a.start)
            val dur = if (a.running) "now · ${Fmt.duration(now - a.start)}" else if (a.end != null && a.end - a.start > 1_000) Fmt.duration(a.end - a.start) else null
            Text(
                listOfNotNull(if (showApp) a.kind.label else null, span, dur, a.detail).joinToString(" · "),
                color = P.dim, fontSize = 13.sp, maxLines = 2, overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(4.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                if (a.screenOff) Pill("Screen off", P.red) else if (a.background) Pill("Background", P.amber)
                val c = a.confidence
                Pill(c.label, if (c == Confidence.EXACT) P.violet else P.faint)
            }
        }
    }
}
