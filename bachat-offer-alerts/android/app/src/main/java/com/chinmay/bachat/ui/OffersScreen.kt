package com.chinmay.bachat.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.chinmay.bachat.core.Deal
import com.chinmay.bachat.core.Deals
import com.chinmay.bachat.core.Discount
import com.chinmay.bachat.core.Kind
import com.chinmay.bachat.core.Match
import com.chinmay.bachat.core.Settings
import com.chinmay.bachat.data.Repo
import java.util.Calendar

private val MINS = listOf(0, 40, 60, 80, 90)

@Composable
fun OffersScreen(deals: List<Deal>, settings: Settings, now: Long, scanning: Boolean, padding: PaddingValues) {
    var age by rememberSaveable { mutableStateOf("now") }
    var onlyMatches by rememberSaveable { mutableStateOf(false) }
    var min by rememberSaveable { mutableStateOf(0) }
    var store by rememberSaveable { mutableStateOf<String?>(null) }
    val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
    val threshold = settings.extraordinary.threshold

    val rows = remember(deals, settings, now) { deals.map { Triple(it, Deals.match(it, settings, now, hour), Deals.isNow(it, settings.nowHours, now)) } }
    val inAge = rows.filter { if (age == "now") it.third else !it.third }
    val counts = inAge.groupingBy { it.first.platform }.eachCount()
    val shown = inAge
        .filter { !onlyMatches || it.second.matches }
        .filter { (it.first.percent ?: 0) >= min || (min > 0 && it.first.d.priceError) }
        .filter { store == null || it.first.platform == store }
        .sortedWith(compareBy<Triple<Deal, Match, Boolean>> { if (Discount.isExtraordinary(it.first.d, threshold)) 0 else 1 }.thenByDescending { it.first.postedAt })
    val nowCount = rows.count { it.third }
    val wowNow = rows.count { it.third && Discount.isExtraordinary(it.first.d, threshold) }

    LazyColumn(
        contentPadding = PaddingValues(start = 14.dp, end = 14.dp, top = padding.calculateTopPadding(), bottom = padding.calculateBottomPadding() + 16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (wowNow > 0) item {
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp))
                    .background(Brush.horizontalGradient(listOf(B.hot.copy(alpha = 0.2f), B.amber.copy(alpha = 0.12f))))
                    .border(1.dp, B.hot.copy(alpha = 0.45f), RoundedCornerShape(18.dp)).padding(14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("🚨", fontSize = 22.sp)
                Spacer(Modifier.width(12.dp))
                Text(
                    "$wowNow extraordinary ${if (wowNow == 1) "deal" else "deals"} right now ($threshold%+ off or a price error). They go fast.",
                    fontWeight = FontWeight.SemiBold, fontSize = 14.sp,
                )
            }
        }
        item {
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(B.panel).border(1.dp, B.line, RoundedCornerShape(14.dp)).padding(4.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Seg("Now", nowCount, age == "now", Modifier.weight(1f)) { age = "now" }
                Seg("Earlier", rows.size - nowCount, age == "earlier", Modifier.weight(1f)) { age = "earlier" }
            }
        }
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Row(Modifier.weight(1f).horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    MINS.forEach { m -> Chip(if (m == 0) "Any %" else "$m%+", min == m) { min = m } }
                }
                Spacer(Modifier.width(8.dp))
                Text("My alerts", color = B.muted, fontSize = 13.sp)
                Spacer(Modifier.width(6.dp))
                Switch(checked = onlyMatches, onCheckedChange = { onlyMatches = it })
            }
        }
        item {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                Chip("All stores", store == null) { store = null }
                Repo.catalog.platforms.filter { (counts[it.id] ?: 0) > 0 }.forEach { p ->
                    Chip(if (p.id == "other") "Other" else p.name, store == p.id, Color(p.color), counts[p.id]) { store = if (store == p.id) null else p.id }
                }
            }
        }
        if (shown.isEmpty()) item {
            Column(
                Modifier.fillMaxWidth().border(1.dp, B.line, RoundedCornerShape(18.dp)).padding(vertical = 44.dp, horizontal = 16.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    when {
                        scanning -> "Checking the deal channels…"
                        age == "now" -> "Nothing in the last ${settings.nowHours} h"
                        else -> "No earlier offers"
                    },
                    fontWeight = FontWeight.Bold,
                )
                Text(if (inAge.isNotEmpty()) "Loosen the filters above to see more." else "Pull Check now, or look at Earlier.", color = B.muted, fontSize = 13.sp)
            }
        }
        items(shown, key = { it.first.id }) { (deal, m, _) -> DealCard(deal, m, threshold, now) }
    }
}

@Composable
private fun Seg(label: String, count: Int, on: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Row(
        modifier.clip(RoundedCornerShape(10.dp)).background(if (on) B.panel2 else Color.Transparent).clickable(onClick = onClick).padding(vertical = 10.dp),
        horizontalArrangement = Arrangement.Center,
    ) {
        Text(label, fontWeight = FontWeight.Bold, color = if (on) B.text else B.muted)
        Spacer(Modifier.width(6.dp))
        Text("$count", fontWeight = FontWeight.Bold, color = B.lime)
    }
}

@Composable
fun Chip(label: String, on: Boolean, color: Color = B.lime, count: Int? = null, onClick: () -> Unit) {
    Row(
        Modifier.clip(CircleShape)
            .background(if (on) color.copy(alpha = 0.16f) else B.bg2)
            .border(1.dp, if (on) color.copy(alpha = 0.7f) else B.line, CircleShape)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (color != B.lime) {
            Box(Modifier.size(8.dp).clip(CircleShape).background(color))
            Spacer(Modifier.width(6.dp))
        }
        Text(label, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = if (on) B.text else B.muted)
        if (count != null) {
            Spacer(Modifier.width(5.dp))
            Text("$count", fontSize = 11.sp, color = B.muted)
        }
    }
}

fun ago(t: Long, now: Long): String {
    val s = ((now - t) / 1000).coerceAtLeast(0)
    return when {
        s < 60 -> "just now"
        s < 3600 -> "${s / 60} min ago"
        s < 86_400 -> "${(s + 1800) / 3600} h ago"
        else -> "${(s + 43_200) / 86_400} d ago"
    }
}

private fun money(v: Double) = "₹" + if (v == Math.floor(v)) "%,d".format(v.toLong()) else "%,.2f".format(v)

@Composable
private fun DealCard(deal: Deal, m: Match, threshold: Int, now: Long) {
    val ctx = LocalContext.current
    val p = Repo.catalog.platform(deal.platform)
    val color = Color(p.color)
    val wow = Discount.isExtraordinary(deal.d, threshold)
    var open by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(18.dp)
    val spin = rememberInfiniteTransition(label = "wow")
    val shift by spin.animateFloat(0f, 1f, infiniteRepeatable(tween(3000, easing = LinearEasing), RepeatMode.Reverse), label = "shift")
    val border = if (wow) Modifier.border(1.5.dp, Brush.linearGradient(listOf(B.hot, B.amber, B.lime).let { if (shift > 0.5f) it.reversed() else it }), shape)
    else Modifier.border(1.dp, B.line, shape)
    val rest = deal.text.lines().map { it.trim() }.filter {
        val bare = Deals.stripLead(it)
        bare.isNotEmpty() && !it.contains(deal.title) && !Deals.ONLY_DISCOUNT.matches(bare) && !Regex("""^(?:https?://)?[\w.-]+\.[a-z]{2,}/\S*$""", RegexOption.IGNORE_CASE).matches(bare)
    }.joinToString("\n").replace(Regex("~~(.*?)~~"), "$1 (was)")
    fun go(url: String) = runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }

    Row(Modifier.fillMaxWidth().clip(shape).background(B.panel).then(border).padding(14.dp)) {
        // The price tag
        Column(
            Modifier.width(82.dp).height(82.dp).clip(RoundedCornerShape(14.dp))
                .background(if (wow) Brush.verticalGradient(listOf(B.hot.copy(alpha = 0.35f), B.amber.copy(alpha = 0.2f))) else Brush.verticalGradient(listOf(color.copy(alpha = 0.18f), color.copy(alpha = 0.18f)))),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            if (deal.d.upTo) Text("UP TO", fontSize = 9.sp, color = B.amber, letterSpacing = 0.6.sp)
            val (main, sub) = when {
                deal.d.kind == Kind.FREE && (deal.d.price ?: 0.0) > 0 -> money(deal.d.price!!) to "DEAL"
                deal.d.kind == Kind.FREE -> "FREE" to "100% OFF"
                deal.d.kind == Kind.BOGO -> "${deal.percent}%" to "BUY + GET"
                deal.percent == null -> "—" to "OFFER"
                deal.d.kind == Kind.FLAT -> "${deal.percent}%" to "FLAT OFF"
                else -> "${deal.percent}%" to "OFF"
            }
            Text(main, fontSize = 24.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.8).sp, color = if (wow) Color.White else B.text)
            Text(sub, fontSize = 10.sp, letterSpacing = 0.9.sp, color = B.muted)
        }
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(Modifier.horizontalScroll(rememberScrollState()), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Pill(if (deal.platform == "other") "Other" else p.name, color.copy(alpha = 0.22f), B.text, dot = color)
                if (deal.d.priceError) Pill("Price error", B.hot.copy(alpha = 0.18f), B.hot)
                else if (wow) Pill("$threshold%+ deal", B.hot.copy(alpha = 0.18f), B.hot)
                if (deal.d.loot) Pill("Loot", B.amber.copy(alpha = 0.16f), B.amber)
                if (m.matches) Pill("Fits your alerts", B.lime.copy(alpha = 0.14f), B.lime)
            }
            Text("${ago(deal.postedAt, now)} · ${deal.sourceName}", fontSize = 12.sp, color = B.muted)
            Text(deal.title, fontWeight = FontWeight.Bold, fontSize = 15.sp, lineHeight = 19.sp)
            if (rest.isNotEmpty()) Text(
                rest, fontSize = 13.sp, color = B.muted, maxLines = if (open) Int.MAX_VALUE else 3, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.clickable { open = !open },
            )
            deal.d.price?.let { price ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(money(price), fontWeight = FontWeight.Bold)
                    deal.d.mrp?.let {
                        Spacer(Modifier.width(6.dp))
                        Text(money(it), color = B.muted, textDecoration = TextDecoration.LineThrough)
                    }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = { go(deal.url) },
                    colors = ButtonDefaults.buttonColors(containerColor = if (wow) B.hot else B.lime, contentColor = if (wow) Color.White else B.onLime),
                    shape = RoundedCornerShape(12.dp),
                ) { Text("Open deal") }
                if (deal.url != deal.postUrl) OutlinedButton(onClick = { go(deal.postUrl) }, shape = RoundedCornerShape(12.dp)) { Text("Post", color = B.text) }
            }
            if (!m.matches) Text("No alert: ${m.reason}", fontSize = 12.sp, color = B.muted)
        }
    }
}

@Composable
fun Pill(label: String, bg: Color, fg: Color, dot: Color? = null) {
    Row(Modifier.clip(CircleShape).background(bg).padding(horizontal = 9.dp, vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
        if (dot != null) {
            Box(Modifier.size(7.dp).clip(CircleShape).background(dot))
            Spacer(Modifier.width(5.dp))
        }
        Text(label, fontSize = 11.sp, fontWeight = FontWeight.Bold, color = fg, style = MaterialTheme.typography.labelSmall)
    }
}
