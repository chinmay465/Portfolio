package com.chinmay.prahari.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.chinmay.prahari.core.Kind

object P {
    val bg = Color(0xFF060B14)
    val surface = Color(0xFF0C1522)
    val surface2 = Color(0xFF122033)
    val line = Color(0xFF1C2B40)
    val text = Color(0xFFE7EEF8)
    val dim = Color(0xFF8C9DB5)
    val faint = Color(0xFF54657E)
    val teal = Color(0xFF35E0C8)
    val amber = Color(0xFFFFB547)
    val red = Color(0xFFFF5C7A)
    val violet = Color(0xFF8B7CFF)
    val blue = Color(0xFF4DA3FF)
    val green = Color(0xFF5BE38C)

    fun kind(k: Kind): Color = when (k) {
        Kind.CAMERA -> red
        Kind.MIC -> amber
        Kind.GPS, Kind.LOCATION -> blue
        Kind.CLIPBOARD -> violet
        Kind.SMS, Kind.CALL_LOG, Kind.CONTACTS -> Color(0xFFFF8F5C)
        else -> teal
    }
}

private val scheme = darkColorScheme(
    primary = P.teal,
    onPrimary = Color(0xFF00201C),
    secondary = P.amber,
    background = P.bg,
    onBackground = P.text,
    surface = P.surface,
    onSurface = P.text,
    surfaceVariant = P.surface2,
    onSurfaceVariant = P.dim,
    outline = P.line,
    error = P.red,
)

private val base = Typography()
private val mono = FontFamily.Monospace

private val type = Typography(
    headlineMedium = base.headlineMedium.copy(fontWeight = FontWeight.Bold, letterSpacing = (-0.5).sp),
    titleLarge = base.titleLarge.copy(fontWeight = FontWeight.SemiBold),
    titleMedium = base.titleMedium.copy(fontWeight = FontWeight.SemiBold),
    labelSmall = base.labelSmall.copy(fontFamily = mono, letterSpacing = 1.sp),
)

val Mono = TextStyle(fontFamily = mono, fontSize = 12.sp, color = P.dim)

@Composable
fun PrahariTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = scheme, typography = type, content = content)
}
