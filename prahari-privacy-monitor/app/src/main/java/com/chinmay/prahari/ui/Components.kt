package com.chinmay.prahari.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.chinmay.prahari.apps.Labels
import com.chinmay.prahari.core.Kind
import com.chinmay.prahari.core.Risk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import kotlin.math.cos
import kotlin.math.sin

@Composable
fun Panel(modifier: Modifier = Modifier, onClick: (() -> Unit)? = null, content: @Composable ColumnScope.() -> Unit) {
    val shape = RoundedCornerShape(18.dp)
    Column(
        modifier
            .fillMaxWidth()
            .clip(shape)
            .background(Brush.verticalGradient(listOf(P.surface2.copy(alpha = 0.75f), P.surface)))
            .border(1.dp, P.line, shape)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(16.dp),
        content = content,
    )
}

@Composable
fun SectionLabel(text: String, modifier: Modifier = Modifier) {
    Text(text.uppercase(Locale.ROOT), style = Mono.copy(fontSize = 11.sp, letterSpacing = 1.6.sp, color = P.teal), modifier = modifier.padding(top = 18.dp, bottom = 8.dp))
}

@Composable
fun Pill(text: String, color: Color, filled: Boolean = false) {
    Text(
        text,
        fontSize = 11.sp,
        fontWeight = FontWeight.SemiBold,
        color = if (filled) P.bg else color,
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(if (filled) color else color.copy(alpha = 0.14f))
            .padding(horizontal = 8.dp, vertical = 3.dp),
    )
}

@Composable
fun Chip(text: String, selected: Boolean, onClick: () -> Unit) {
    Text(
        text,
        fontSize = 13.sp,
        color = if (selected) P.bg else P.dim,
        fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(if (selected) P.teal else P.surface2)
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 7.dp),
    )
}

@Composable
fun AppIcon(pkg: String?, size: Dp = 40.dp) {
    val ctx = LocalContext.current
    val bmp by produceState<ImageBitmap?>(null, pkg) {
        value = if (pkg == null) null else withContext(Dispatchers.IO) { Labels.icon(ctx, pkg)?.asImageBitmap() }
    }
    Box(
        Modifier
            .size(size)
            .clip(RoundedCornerShape(size / 4))
            .background(P.surface2),
        contentAlignment = Alignment.Center,
    ) {
        bmp?.let { Image(it, contentDescription = null, modifier = Modifier.size(size)) }
            ?: Text("?", color = P.faint, fontWeight = FontWeight.Bold)
    }
}

/** A round badge with a hand-drawn glyph for each kind. */
@Composable
fun KindBadge(kind: Kind, size: Dp = 36.dp, live: Boolean = false) {
    val c = P.kind(kind)
    val pulse = if (live) {
        val t = rememberInfiniteTransition(label = "pulse")
        t.animateFloat(0.25f, 0.7f, infiniteRepeatable(tween(900), RepeatMode.Reverse), label = "a").value
    } else {
        0.16f
    }
    Box(
        Modifier
            .size(size)
            .clip(CircleShape)
            .background(c.copy(alpha = pulse)),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.size(size * 0.5f)) { glyph(kind, if (live) Color.White else c) }
    }
}

private fun DrawScope.glyph(kind: Kind, c: Color) {
    val w = size.width
    val s = Stroke(width = w * 0.11f)
    when (kind) {
        Kind.CAMERA -> {
            drawRoundRect(c, Offset(0f, w * 0.22f), Size(w, w * 0.66f), CornerRadius(w * 0.14f), style = s)
            drawCircle(c, w * 0.18f, Offset(w / 2, w * 0.55f), style = s)
            drawRect(c, Offset(w * 0.3f, w * 0.08f), Size(w * 0.4f, w * 0.14f))
        }
        Kind.MIC -> {
            drawRoundRect(c, Offset(w * 0.32f, 0f), Size(w * 0.36f, w * 0.62f), CornerRadius(w * 0.18f))
            drawArc(c, 0f, 180f, false, Offset(w * 0.14f, w * 0.2f), Size(w * 0.72f, w * 0.6f), style = s)
            drawLine(c, Offset(w / 2, w * 0.8f), Offset(w / 2, w), strokeWidth = w * 0.11f)
        }
        Kind.GPS, Kind.LOCATION -> {
            drawCircle(c, w * 0.3f, Offset(w / 2, w * 0.38f), style = s)
            drawCircle(c, w * 0.09f, Offset(w / 2, w * 0.38f))
            drawLine(c, Offset(w * 0.28f, w * 0.6f), Offset(w / 2, w), strokeWidth = w * 0.11f)
            drawLine(c, Offset(w * 0.72f, w * 0.6f), Offset(w / 2, w), strokeWidth = w * 0.11f)
        }
        Kind.CLIPBOARD -> {
            drawRoundRect(c, Offset(w * 0.12f, w * 0.12f), Size(w * 0.76f, w * 0.88f), CornerRadius(w * 0.1f), style = s)
            drawRoundRect(c, Offset(w * 0.32f, 0f), Size(w * 0.36f, w * 0.22f), CornerRadius(w * 0.06f))
            drawLine(c, Offset(w * 0.3f, w * 0.5f), Offset(w * 0.7f, w * 0.5f), strokeWidth = w * 0.08f)
            drawLine(c, Offset(w * 0.3f, w * 0.72f), Offset(w * 0.6f, w * 0.72f), strokeWidth = w * 0.08f)
        }
        Kind.CONTACTS, Kind.ACCOUNTS -> {
            drawCircle(c, w * 0.22f, Offset(w / 2, w * 0.3f))
            drawArc(c, 180f, 180f, true, Offset(w * 0.12f, w * 0.6f), Size(w * 0.76f, w * 0.7f))
        }
        Kind.SMS -> {
            drawRoundRect(c, Offset(0f, w * 0.1f), Size(w, w * 0.66f), CornerRadius(w * 0.16f), style = s)
            drawLine(c, Offset(w * 0.25f, w * 0.76f), Offset(w * 0.2f, w), strokeWidth = w * 0.11f)
        }
        else -> {
            drawCircle(c, w * 0.42f, Offset(w / 2, w / 2), style = s)
            drawCircle(c, w * 0.12f, Offset(w / 2, w / 2))
        }
    }
}

/** The animated radar on the Live screen. Only draws while the screen is visible. */
@Composable
fun Radar(active: List<Kind>, watching: Boolean, modifier: Modifier = Modifier) {
    val t = rememberInfiniteTransition(label = "radar")
    val angle by t.animateFloat(0f, 360f, infiniteRepeatable(tween(4200, easing = LinearEasing)), label = "sweep")
    Canvas(modifier) {
        val r = size.minDimension / 2
        val c = Offset(size.width / 2, size.height / 2)
        val tint = if (watching) P.teal else P.faint
        for (i in 1..4) drawCircle(tint.copy(alpha = 0.10f + 0.05f * i), r * i / 4f, c, style = Stroke(1.2f))
        drawLine(tint.copy(alpha = 0.12f), Offset(c.x - r, c.y), Offset(c.x + r, c.y))
        drawLine(tint.copy(alpha = 0.12f), Offset(c.x, c.y - r), Offset(c.x, c.y + r))
        if (watching) {
            rotate(angle, c) {
                drawArc(
                    Brush.sweepGradient(listOf(Color.Transparent, Color.Transparent, tint.copy(alpha = 0.45f)), c),
                    -60f, 60f, true, Offset(c.x - r, c.y - r), Size(r * 2, r * 2),
                )
            }
        }
        active.forEachIndexed { i, k ->
            val a = Math.toRadians((40.0 + i * 110.0))
            val p = Offset(c.x + (r * 0.55f * cos(a)).toFloat(), c.y + (r * 0.55f * sin(a)).toFloat())
            drawCircle(P.kind(k).copy(alpha = 0.25f), r * 0.13f, p)
            drawCircle(P.kind(k), r * 0.055f, p)
        }
        drawCircle(tint, r * 0.05f, c)
    }
}

@Composable
fun ScoreRing(score: Int, level: Risk.Level, size: Dp = 64.dp) {
    val c = levelColor(level)
    Box(Modifier.size(size), contentAlignment = Alignment.Center) {
        Canvas(Modifier.size(size)) {
            drawCircle(P.line, this.size.minDimension / 2 - 4f, style = Stroke(8f))
            drawArc(c, -90f, 360f * score / 100f, false, Offset(4f, 4f), Size(this.size.width - 8f, this.size.height - 8f), style = Stroke(8f))
        }
        Text("$score", fontWeight = FontWeight.Bold, fontSize = (size.value / 3.2f).sp, color = c)
    }
}

fun levelColor(l: Risk.Level) = when (l) {
    Risk.Level.HIGH -> P.red
    Risk.Level.MEDIUM -> P.amber
    Risk.Level.LOW -> P.green
}

@Composable
fun SettingRow(title: String, body: String?, checked: Boolean, enabled: Boolean = true, onChange: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(enabled = enabled) { onChange(!checked) }.padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, style = androidx.compose.material3.MaterialTheme.typography.titleSmall)
            if (body != null) Text(body, color = P.dim, fontSize = 13.sp)
        }
        Spacer(Modifier.width(12.dp))
        Switch(
            checked = checked, onCheckedChange = onChange, enabled = enabled,
            colors = SwitchDefaults.colors(checkedTrackColor = P.teal, checkedThumbColor = P.bg),
        )
    }
}

@Composable
fun RowScope.Stat(value: String, label: String, color: Color = P.text) {
    Column(Modifier.weight(1f)) {
        Text(value, color = color, fontWeight = FontWeight.Bold, fontSize = 18.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(label, color = P.dim, fontSize = 12.sp)
    }
}

@Composable
fun Bullet(text: String, color: Color = P.dim) {
    Row(Modifier.padding(vertical = 3.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Box(Modifier.padding(top = 7.dp).size(5.dp).clip(CircleShape).background(color))
        Text(text, color = P.text, fontSize = 14.sp)
    }
}

object Fmt {
    private val time = SimpleDateFormat("HH:mm", Locale.getDefault())
    private val day = SimpleDateFormat("EEE d MMM", Locale.getDefault())
    private val full = SimpleDateFormat("d MMM, HH:mm", Locale.getDefault())

    fun time(t: Long): String = time.format(Date(t))
    fun full(t: Long): String = full.format(Date(t))

    fun day(t: Long): String {
        val c = Calendar.getInstance()
        val today = c.apply { set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0) }.timeInMillis
        return when {
            t >= today -> "Today"
            t >= today - 86_400_000L -> "Yesterday"
            else -> day.format(Date(t))
        }
    }

    fun duration(ms: Long): String {
        val s = ms / 1000
        return when {
            s < 1 -> "a moment"
            s < 60 -> "${s}s"
            s < 3600 -> "${s / 60} min"
            else -> "${s / 3600} h ${(s % 3600) / 60} min"
        }
    }

    fun ago(t: Long, now: Long = System.currentTimeMillis()): String {
        val m = (now - t) / 60_000
        return when {
            m < 1 -> "just now"
            m < 60 -> "$m min ago"
            m < 24 * 60 -> "${m / 60} h ago"
            else -> "${m / (24 * 60)} d ago"
        }
    }
}

/** A list item whose children stack vertically. */
fun androidx.compose.foundation.lazy.LazyListScope.block(content: @Composable ColumnScope.() -> Unit) =
    item { Column(Modifier.fillMaxWidth(), content = content) }
