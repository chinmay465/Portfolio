package com.chinmay.prahari.ui

import android.content.ClipData
import android.content.ClipboardManager
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
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.chinmay.prahari.apps.AppInfo
import com.chinmay.prahari.apps.Inventory
import com.chinmay.prahari.apps.Labels
import com.chinmay.prahari.apps.TrackerSdks
import com.chinmay.prahari.canary.Canary
import com.chinmay.prahari.core.Access
import com.chinmay.prahari.core.Kind
import com.chinmay.prahari.core.LiveState
import com.chinmay.prahari.data.Db
import com.chinmay.prahari.data.Prefs
import com.chinmay.prahari.data.Reports
import com.chinmay.prahari.watch.WatchService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private data class TypingData(
    val keyboards: List<AppInfo>,
    val screenReaders: List<AppInfo>,
    val notificationReaders: List<AppInfo>,
    val autofill: List<AppInfo>,
    val assistants: List<AppInfo>,
    val admins: List<AppInfo>,
    val replay: List<Pair<String, List<TrackerSdks.Sdk>>>,
    val clipboard: List<Access>,
)

@Composable
fun TypingScreen(padding: PaddingValues, onOpenApp: (String) -> Unit) {
    val ctx = LocalContext.current
    val rev by LiveState.revision.collectAsState()
    val precision by LiveState.precision.collectAsState()

    val data by produceState<TypingData?>(null, rev) {
        value = withContext(Dispatchers.IO) {
            val prefs = Prefs(ctx)
            val apps = Inventory.load(ctx, includeSystem = true)
            val user = apps.filter { !it.system || prefs.includeSystem }
            val scans = Db.get(ctx).scans()
            TypingData(
                keyboards = apps.filter { it.exposure.keyboard }.sortedByDescending { it.exposure.defaultKeyboard },
                screenReaders = apps.filter { it.exposure.accessibility },
                notificationReaders = apps.filter { it.exposure.notifications },
                autofill = apps.filter { it.exposure.autofill },
                assistants = apps.filter { it.exposure.assistant },
                admins = apps.filter { it.exposure.deviceAdmin },
                replay = user.mapNotNull { a ->
                    val sdks = TrackerSdks.resolve(scans[a.pkg]?.trackers.orEmpty()).filter { it.category == TrackerSdks.Category.SESSION_REPLAY }
                    if (sdks.isEmpty()) null else a.pkg to sdks
                },
                clipboard = Db.get(ctx).accesses(System.currentTimeMillis() - Reports.WEEK, limit = 3000).filter { it.kind == Kind.CLIPBOARD },
            )
        }
    }

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = padding.calculateTopPadding() + 8.dp, bottom = padding.calculateBottomPadding() + 24.dp),
    ) {
        block {
            Text("Typing", style = MaterialTheme.typography.headlineMedium)
            Text(
                "Searches and messages travel encrypted, so no app on an unrooted phone can read them in transit. What can be checked is who sees your keystrokes before that: these apps.",
                color = P.dim, fontSize = 14.sp,
            )
        }
        block { CanaryCard() }

        val d = data
        if (d == null) {
            block { Text("Checking…", color = P.dim, modifier = Modifier.padding(16.dp)) }
        } else {
            group("Keyboards · see every key", d.keyboards, onOpenApp) { a ->
                if (a.exposure.defaultKeyboard) "Your current keyboard" else "Enabled, not in use"
            }
            group("Accessibility · can read the screen", d.screenReaders, onOpenApp) { a ->
                listOfNotNull(
                    if (a.exposure.readsScreen) "reads text on screen and in fields" else "limited access",
                    if (a.exposure.filtersKeys) "intercepts keys" else null,
                ).joinToString(" · ")
            }
            group("Read all notifications", d.notificationReaders, onOpenApp) { "messages, OTPs, bank alerts" }
            group("Autofill", d.autofill, onOpenApp) { "sees forms and passwords you fill" }
            group("Assistant", d.assistants, onOpenApp) { "reads the screen when you invoke it" }
            group("Device admin", d.admins, onOpenApp) { "can lock or wipe the phone" }

            block {
                SectionLabel("Session replay inside apps")
                Panel {
                    if (d.replay.isEmpty()) {
                        Text("No scanned app contains a session-replay SDK. (Scan runs on the Apps tab.)", color = P.dim)
                    } else {
                        Text(TrackerSdks.Category.SESSION_REPLAY.explain, color = P.dim, fontSize = 13.sp)
                        Spacer(Modifier.height(8.dp))
                        d.replay.forEach { (pkg, sdks) ->
                            Row(Modifier.fillMaxWidth().clickable { onOpenApp(pkg) }.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                                AppIcon(pkg, 32.dp)
                                Spacer(Modifier.width(10.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(Labels.name(ctx, pkg), fontWeight = FontWeight.SemiBold)
                                    Text(sdks.joinToString(", ") { it.name }, color = P.red, fontSize = 13.sp)
                                }
                            }
                        }
                    }
                }
            }

            block {
                SectionLabel("Clipboard reads · last 7 days")
                Panel {
                    when {
                        !precision -> Text("Needs precision mode (Setup). Android records clipboard reads but only shares them with apps granted access over adb.", color = P.dim)
                        d.clipboard.isEmpty() -> Text("No app read the clipboard.", color = P.green)
                        else -> d.clipboard.groupBy { it.pkg }.entries.sortedByDescending { it.value.size }.forEach { (pkg, list) ->
                            Row(Modifier.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text(Labels.name(ctx, pkg), fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                                Text("${list.size}× · ${list.count { it.background }} in background · last ${Fmt.ago(list.first().start)}", style = Mono)
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.group(
    title: String,
    apps: List<AppInfo>,
    onOpenApp: (String) -> Unit,
    line: (AppInfo) -> String,
) {
    if (apps.isEmpty()) return
    block {
        SectionLabel(title)
        Panel {
            apps.forEach { a ->
                Row(Modifier.fillMaxWidth().clickable { onOpenApp(a.pkg) }.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    AppIcon(a.pkg, 32.dp)
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(a.label, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                            if (a.system) {
                                Spacer(Modifier.width(6.dp))
                                Pill("System", P.faint)
                            }
                        }
                        Text(line(a), color = P.dim, fontSize = 13.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun CanaryCard() {
    val ctx = LocalContext.current
    val prefs = remember { Prefs(ctx) }
    val scope = rememberCoroutineScope()
    var word by remember { mutableStateOf(prefs.canaryWord) }
    var result by remember { mutableStateOf<Canary.Result?>(null) }
    var busy by remember { mutableStateOf(false) }
    val canRead = remember(result) { Canary.canReadLogs(ctx) }

    SectionLabel("Canary test · does an app log what you type?")
    Panel {
        Text(
            "1. Make a canary word. 2. Type it into the app you suspect (its search box, a chat, a form). 3. Come back and check. Prahari searches the phone's shared log, where careless apps write your input before shipping logs to their servers.",
            color = P.dim, fontSize = 13.sp,
        )
        Spacer(Modifier.height(10.dp))
        word?.let { w ->
            Text(w, style = MaterialTheme.typography.headlineSmall.copy(fontFamily = Mono.fontFamily, color = P.amber))
            Text("Made ${Fmt.ago(prefs.canarySince)}", style = Mono)
            Spacer(Modifier.height(10.dp))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = {
                val w = Canary.newWord()
                prefs.canaryWord = w
                prefs.canarySince = System.currentTimeMillis()
                word = w
                result = null
            }) { Text(if (word == null) "Make word" else "New word") }
            if (word != null) {
                OutlinedButton(onClick = {
                    // Also a clipboard canary: precision mode then shows who reads it.
                    ctx.getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("canary", word))
                }) { Text("Copy") }
                Button(
                    enabled = !busy,
                    onClick = {
                        busy = true
                        scope.launch {
                            result = withContext(Dispatchers.IO) { Canary.check(ctx, word!!) }
                            WatchService.pollNow(ctx)
                            busy = false
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = P.teal, contentColor = P.bg),
                ) { Text(if (busy) "Checking…" else "Check") }
            }
        }
        if (!canRead) {
            Spacer(Modifier.height(10.dp))
            Text("Reading other apps' logs needs a one-time grant from a computer:", color = P.amber, fontSize = 13.sp)
            CommandBox(Canary.ADB_GRANT)
        }
        result?.let { r ->
            Spacer(Modifier.height(12.dp))
            when {
                r.error != null -> Text("Couldn't read the log: ${r.error}", color = P.red)
                r.hits.isNotEmpty() -> {
                    Text("Found in the log ${r.hits.size} time${if (r.hits.size == 1) "" else "s"}", color = P.red, fontWeight = FontWeight.SemiBold)
                    r.hits.groupBy { it.pkg }.forEach { (pkg, hits) ->
                        Spacer(Modifier.height(6.dp))
                        Text(pkg?.let { Labels.name(ctx, it) } ?: "uid ${hits.first().uidLabel}", fontWeight = FontWeight.SemiBold)
                        hits.take(4).forEach { h -> Text("${h.time}  ${h.tag}: ${h.message}", style = Mono, maxLines = 3, overflow = TextOverflow.Ellipsis) }
                    }
                    Spacer(Modifier.height(6.dp))
                    Text("An app that writes your input to the log can upload those logs later, and any app with log access can read them.", color = P.dim, fontSize = 13.sp)
                }
                !r.sawOtherApps -> Text(
                    "Not found, but Android only showed Prahari its own log lines (${r.linesRead} read). " +
                        if (canRead) "If Android asked to allow log access, tap Allow and check again." else "Grant log access with the command above.",
                    color = P.amber, fontSize = 13.sp,
                )
                else -> Text("Not found in ${r.linesRead} log lines from all apps. No app wrote your canary to the log.", color = P.green)
            }
        }
    }
}

@Composable
fun CommandBox(cmd: String) {
    val ctx = LocalContext.current
    Spacer(Modifier.height(6.dp))
    Column(
        Modifier
            .fillMaxWidth()
            .clickable { ctx.getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("adb", cmd)) }
            .padding(vertical = 4.dp),
    ) {
        Panel {
            Text(cmd, style = Mono.copy(color = P.teal, fontSize = 12.sp))
            Text("Tap to copy", color = P.faint, fontSize = 11.sp)
        }
    }
}
