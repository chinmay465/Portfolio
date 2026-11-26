package com.chinmay.prahari.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
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
import com.chinmay.prahari.apps.Inventory
import com.chinmay.prahari.apps.Scanner
import com.chinmay.prahari.apps.TrackerSdks
import com.chinmay.prahari.core.LiveState
import com.chinmay.prahari.core.Risk
import com.chinmay.prahari.data.AppReport
import com.chinmay.prahari.data.Prefs
import com.chinmay.prahari.data.Reports
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private enum class AppFilter(val label: String) { ALL("All"), HIGH("High risk"), TYPING("Sees typing"), REPLAY("Session replay"), BG("Background use") }

@Composable
fun AppsScreen(padding: PaddingValues, onOpenApp: (String) -> Unit) {
    val ctx = LocalContext.current
    val rev by LiveState.revision.collectAsState()
    val includeSystem = remember { Prefs(ctx).includeSystem }
    var query by rememberSaveable { mutableStateOf("") }
    var filter by rememberSaveable { mutableStateOf(AppFilter.ALL) }
    var progress by remember { mutableStateOf<Triple<Int, Int, String>?>(null) }

    // Read each new or updated APK once for tracker SDKs. Visible, so it never runs behind your back.
    LaunchedEffect(Unit) {
        withContext(Dispatchers.IO) {
            Scanner.scan(ctx, Inventory.load(ctx, includeSystem)) { done, total, label ->
                progress = if (done >= total) null else Triple(done, total, label)
            }
        }
        progress = null
    }

    val reports by produceState<List<AppReport>?>(null, rev) {
        value = withContext(Dispatchers.IO) { Reports.all(ctx, includeSystem) }
    }

    val shown = reports.orEmpty().filter { r ->
        (query.isBlank() || r.app.label.contains(query, true) || r.app.pkg.contains(query, true)) &&
            when (filter) {
                AppFilter.ALL -> true
                AppFilter.HIGH -> r.risk.level == Risk.Level.HIGH
                AppFilter.TYPING -> r.app.exposure.keyboard || r.app.exposure.readsScreen || r.app.exposure.autofill || r.app.exposure.notifications
                AppFilter.REPLAY -> r.trackers.any { it.category == TrackerSdks.Category.SESSION_REPLAY }
                AppFilter.BG -> r.risk.reasons.any { it.behaviour }
            }
    }

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = padding.calculateTopPadding() + 8.dp, bottom = padding.calculateBottomPadding() + 24.dp),
    ) {
        block {
            Text("Apps", style = MaterialTheme.typography.headlineMedium)
            Text("Ranked by what each app did, what it can see, and the trackers built into it.", color = P.dim, fontSize = 14.sp)
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = query, onValueChange = { query = it }, singleLine = true,
                placeholder = { Text("Search apps") },
                shape = RoundedCornerShape(14.dp),
                colors = OutlinedTextFieldDefaults.colors(unfocusedBorderColor = P.line, focusedBorderColor = P.teal),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(10.dp))
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                AppFilter.entries.forEach { f -> Chip(f.label, filter == f) { filter = f } }
            }
            progress?.let { (done, total, label) ->
                Spacer(Modifier.height(12.dp))
                Panel {
                    Text("Looking for trackers inside apps · $done of $total", fontSize = 13.sp, color = P.dim)
                    Text(label, fontWeight = FontWeight.SemiBold, maxLines = 1)
                    Spacer(Modifier.height(8.dp))
                    LinearProgressIndicator(progress = { if (total == 0) 0f else done / total.toFloat() }, modifier = Modifier.fillMaxWidth(), color = P.teal, trackColor = P.line)
                }
            }
            Spacer(Modifier.height(8.dp))
        }
        if (reports == null) block { Text("Reading installed apps…", color = P.dim, modifier = Modifier.padding(24.dp)) }
        items(shown, key = { it.app.pkg }) { r -> AppRow(r) { onOpenApp(r.app.pkg) } }
    }
}

@Composable
private fun AppRow(r: AppReport, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        AppIcon(r.app.pkg, 44.dp)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(r.app.label, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                if (r.app.system) {
                    Spacer(Modifier.width(6.dp))
                    Pill("System", P.faint)
                }
            }
            Text(
                r.risk.reasons.firstOrNull()?.text ?: if (r.scanned) "Nothing notable" else "Not scanned yet",
                color = P.dim, fontSize = 13.sp, maxLines = 2, overflow = TextOverflow.Ellipsis,
            )
            val tags = buildList {
                if (r.trackers.isNotEmpty()) add("${r.trackers.size} tracker SDK${if (r.trackers.size == 1) "" else "s"}")
                if (r.accesses.any { it.background && it.pkg == r.app.pkg }) add("background use")
                if (r.dns.any { it.tracker != null }) add("tracker servers")
            }
            if (tags.isNotEmpty()) Text(tags.joinToString(" · "), style = Mono.copy(fontSize = 11.sp, color = P.faint))
        }
        Spacer(Modifier.width(10.dp))
        ScoreRing(r.risk.score, r.risk.level, 44.dp)
    }
}
