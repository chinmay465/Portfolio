package com.chinmay.bachat.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/** Same palette as the web app (src/index.css). */
object B {
    val bg = Color(0xFF0E0C15)
    val bg2 = Color(0xFF13111C)
    val panel = Color(0xFF18151F)
    val panel2 = Color(0xFF201C2A)
    val line = Color(0xFF2C2738)
    val text = Color(0xFFF1EEF7)
    val muted = Color(0xFF9A93AB)
    val lime = Color(0xFFD4FF3A)
    val mint = Color(0xFF7CF2A0)
    val hot = Color(0xFFFF3D7F)
    val amber = Color(0xFFFFB020)
    val onLime = Color(0xFF12100A)
}

private val scheme = darkColorScheme(
    primary = B.lime,
    onPrimary = B.onLime,
    secondary = B.hot,
    onSecondary = Color.White,
    background = B.bg,
    onBackground = B.text,
    surface = B.panel,
    onSurface = B.text,
    surfaceVariant = B.panel2,
    onSurfaceVariant = B.muted,
    surfaceContainer = B.panel,
    surfaceContainerHigh = B.panel2,
    outline = B.line,
    outlineVariant = B.line,
    error = B.hot,
)

private val base = Typography()
private val type = Typography(
    headlineMedium = base.headlineMedium.copy(fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.6).sp),
    headlineSmall = base.headlineSmall.copy(fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.4).sp),
    titleLarge = base.titleLarge.copy(fontWeight = FontWeight.Bold),
    titleMedium = base.titleMedium.copy(fontWeight = FontWeight.Bold),
    labelLarge = base.labelLarge.copy(fontWeight = FontWeight.Bold),
)

@Composable
fun BachatTheme(content: @Composable () -> Unit) = MaterialTheme(colorScheme = scheme, typography = type, content = content)
