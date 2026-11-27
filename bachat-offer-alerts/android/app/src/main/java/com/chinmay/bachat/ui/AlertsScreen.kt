package com.chinmay.bachat.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.chinmay.bachat.core.Settings
import com.chinmay.bachat.data.Repo

private val GROUPS = listOf(
    "food" to "Food delivery",
    "grocery" to "Quick commerce & grocery",
    "shopping" to "Shopping",
    "movies" to "Movies",
    "other" to "Everything else",
)
private val HOURS = listOf(1, 3, 6, 12, 24)
private val INTERVALS = listOf(15, 30, 60)
private fun words(s: String) = s.split(',').map { it.trim().lowercase() }.filter { it.isNotEmpty() }

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun AlertsScreen(
    settings: Settings,
    notificationsOn: Boolean,
    padding: PaddingValues,
    onAskNotifications: () -> Unit,
    onTest: () -> Unit,
    onSave: (Settings) -> Unit,
) {
    var draft by remember(settings) { mutableStateOf(settings) }
    var kw by remember(settings) { mutableStateOf(settings.keywords.joinToString(", ")) }
    var mute by remember(settings) { mutableStateOf(settings.muted.joinToString(", ")) }
    val full = draft.copy(keywords = words(kw), muted = words(mute))
    val dirty = full != settings
    LaunchedEffect(settings) { draft = settings }

    Box(Modifier.fillMaxSize()) {
        Column(
            Modifier.verticalScroll(rememberScrollState())
                .padding(start = 14.dp, end = 14.dp, top = padding.calculateTopPadding(), bottom = padding.calculateBottomPadding() + if (dirty) 80.dp else 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Card(tint = B.lime) {
                H("Notifications")
                Sub(if (notificationsOn) "On. Bachat checks every ${draft.intervalMinutes} minutes in the background, on your phone’s own connection." else "Off. Allow notifications so Bachat can alert you.")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(9.dp).clip(CircleShape).background(if (notificationsOn) B.lime else B.muted))
                    Text(if (notificationsOn) "On" else "Off", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                    Spacer(Modifier.width(4.dp))
                    if (!notificationsOn) Button(onClick = onAskNotifications, shape = RoundedCornerShape(12.dp)) { Text("Allow notifications") }
                    else OutlinedButton(onClick = onTest, shape = RoundedCornerShape(12.dp)) { Text("Send a test", color = B.text) }
                }
                Text("Check every", color = B.muted, fontSize = 13.sp)
                Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    INTERVALS.forEach { m -> Chip("$m min", draft.intervalMinutes == m) { draft = draft.copy(intervalMinutes = m) } }
                }
            }

            Card {
                H("Minimum discount")
                Sub("Alert me when an offer is at least this much off.")
                Row(verticalAlignment = Alignment.Bottom) {
                    Text("${draft.minDiscount}%", fontSize = 30.sp, fontWeight = FontWeight.ExtraBold, color = B.lime)
                    Spacer(Modifier.weight(1f))
                    Text("off or more", color = B.muted)
                }
                Slider(
                    value = draft.minDiscount.toFloat(), onValueChange = { draft = draft.copy(minDiscount = (Math.round(it / 5f) * 5)) },
                    valueRange = 0f..95f, steps = 18,
                )
                Toggle("Count “up to X% off” sale claims", draft.includeUpTo) { draft = draft.copy(includeUpTo = it) }
                Toggle("Also alert for coupons that don’t state a discount", draft.includeNoDiscount) { draft = draft.copy(includeNoDiscount = it) }
            }

            Card(tint = B.hot) {
                H("🚨 Extraordinary deals")
                Sub("Real 90%+ discounts and price errors. They alert loudly on their own channel and skip quiet hours. “Up to 90%” sale banners don’t count.")
                Toggle("Alert me for extraordinary deals", draft.extraordinary.enabled) { draft = draft.copy(extraordinary = draft.extraordinary.copy(enabled = it)) }
                Row(verticalAlignment = Alignment.Bottom) {
                    Text("${draft.extraordinary.threshold}%", fontSize = 30.sp, fontWeight = FontWeight.ExtraBold, color = B.hot)
                    Spacer(Modifier.weight(1f))
                    Text("counts as extraordinary", color = B.muted)
                }
                Slider(
                    value = draft.extraordinary.threshold.toFloat(),
                    onValueChange = { draft = draft.copy(extraordinary = draft.extraordinary.copy(threshold = Math.round(it))) },
                    valueRange = 70f..99f, steps = 28,
                    colors = SliderDefaults.colors(thumbColor = B.hot, activeTrackColor = B.hot),
                )
                Toggle("From any store, even ones switched off below", draft.extraordinary.anyPlatform) { draft = draft.copy(extraordinary = draft.extraordinary.copy(anyPlatform = it)) }
            }

            Card {
                H("Offers available now or earlier")
                Sub("Pick which offers can alert you, by when they were posted.")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Tile("Live now", draft.agesNow, B.lime, Modifier.weight(1f)) { draft = draft.copy(agesNow = it) }
                    Tile("Posted earlier", draft.agesEarlier, B.lime, Modifier.weight(1f)) { draft = draft.copy(agesEarlier = it) }
                }
                Text("“Now” means posted within", color = B.muted, fontSize = 13.sp)
                Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    HOURS.forEach { h -> Chip("$h h", draft.nowHours == h) { draft = draft.copy(nowHours = h) } }
                }
                if (!draft.agesNow && !draft.agesEarlier) Text("With both off, nothing will alert you.", color = B.hot, fontSize = 13.sp)
            }

            Card {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    H("Stores")
                    Spacer(Modifier.weight(1f))
                    Link("All") { draft = draft.copy(platforms = Repo.catalog.platforms.associate { it.id to true }) }
                    Text("  ·  ", color = B.muted)
                    Link("None") { draft = draft.copy(platforms = Repo.catalog.platforms.associate { it.id to false }) }
                }
                GROUPS.forEach { (group, label) ->
                    val list = Repo.catalog.platforms.filter { it.group == group }
                    val allOn = list.all { draft.platformOn(it.id) }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(label, color = B.muted, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.weight(1f))
                        if (list.size > 1) Link(if (allOn) "Uncheck all" else "Check all") {
                            draft = draft.copy(platforms = draft.platforms + list.associate { it.id to !allOn })
                        }
                    }
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp), maxItemsInEachRow = 2) {
                        list.forEach { p ->
                            Tile(p.name, draft.platformOn(p.id), Color(p.color), Modifier.weight(1f)) {
                                draft = draft.copy(platforms = draft.platforms + (p.id to it))
                            }
                        }
                        if (list.size % 2 == 1) Spacer(Modifier.weight(1f))
                    }
                }
            }

            Card {
                H("Words")
                OutlinedTextField(kw, { kw = it }, Modifier.fillMaxWidth(), label = { Text("Only alert when it mentions (comma separated)") }, placeholder = { Text("biryani, airpods") }, singleLine = true)
                OutlinedTextField(mute, { mute = it }, Modifier.fillMaxWidth(), label = { Text("Never alert when it mentions") }, placeholder = { Text("credit card, emi") }, singleLine = true)
            }

            Card {
                H("Quiet hours")
                Toggle("Hold normal alerts overnight (extraordinary deals still come through)", draft.quiet.enabled) { draft = draft.copy(quiet = draft.quiet.copy(enabled = it)) }
                if (draft.quiet.enabled) {
                    Text("From ${"%02d".format(draft.quiet.from)}:00 until ${"%02d".format(draft.quiet.to)}:00", fontWeight = FontWeight.Bold)
                    Slider(draft.quiet.from.toFloat(), { draft = draft.copy(quiet = draft.quiet.copy(from = Math.round(it))) }, valueRange = 0f..23f, steps = 22)
                    Slider(draft.quiet.to.toFloat(), { draft = draft.copy(quiet = draft.quiet.copy(to = Math.round(it))) }, valueRange = 0f..23f, steps = 22)
                }
            }
        }
        if (dirty) Row(
            Modifier.align(Alignment.BottomCenter).padding(start = 14.dp, end = 14.dp, bottom = padding.calculateBottomPadding() + 10.dp)
                .fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(B.panel2).border(1.dp, B.lime, RoundedCornerShape(16.dp)).padding(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Unsaved changes", fontWeight = FontWeight.SemiBold, fontSize = 13.sp, modifier = Modifier.weight(1f))
            Button(onClick = { onSave(full) }, shape = RoundedCornerShape(12.dp), colors = ButtonDefaults.buttonColors(containerColor = B.lime, contentColor = B.onLime)) { Text("Save alerts") }
        }
    }
}

@Composable
fun Card(tint: Color? = null, content: @Composable ColumnScope.() -> Unit) {
    val shape = RoundedCornerShape(18.dp)
    Column(
        Modifier.fillMaxWidth().clip(shape)
            .background(if (tint != null) Brush.linearGradient(listOf(tint.copy(alpha = 0.12f), B.panel)) else Brush.linearGradient(listOf(B.panel, B.panel)))
            .border(1.dp, if (tint == B.hot) B.hot.copy(alpha = 0.35f) else B.line, shape)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        content = content,
    )
}

@Composable fun H(text: String) = Text(text, fontSize = 16.sp, fontWeight = FontWeight.ExtraBold)
@Composable fun Sub(text: String) = Text(text, fontSize = 13.sp, color = B.muted)
@Composable fun Link(text: String, onClick: () -> Unit) = Text(text, color = B.lime, fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = Modifier.clickable(onClick = onClick))

@Composable
fun Toggle(label: String, on: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().clickable { onChange(!on) }, verticalAlignment = Alignment.CenterVertically) {
        Text(label, fontSize = 14.sp, modifier = Modifier.weight(1f))
        Spacer(Modifier.width(10.dp))
        Switch(checked = on, onCheckedChange = onChange)
    }
}

@Composable
private fun Tile(label: String, on: Boolean, color: Color, modifier: Modifier, onChange: (Boolean) -> Unit) {
    Row(
        modifier.clip(RoundedCornerShape(12.dp)).background(B.bg2)
            .border(1.dp, if (on) color.copy(alpha = 0.6f) else B.line, RoundedCornerShape(12.dp))
            .clickable { onChange(!on) }.padding(start = 2.dp, end = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Checkbox(checked = on, onCheckedChange = onChange)
        Text(label, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, modifier = Modifier.weight(1f))
        Box(Modifier.size(9.dp).clip(CircleShape).background(color))
    }
}
