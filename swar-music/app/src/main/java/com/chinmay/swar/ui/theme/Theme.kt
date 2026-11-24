package com.chinmay.swar.ui.theme

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Swar's look: deep space, aurora glows, glass, a cyan-to-violet accent. */
object Swar {
    val Space = Color(0xFF05060B)
    val Glass = Color(0xF00C0E1A)
    val GlassLight = Color(0x1AFFFFFF)
    val Cyan = Color(0xFF3DD6FF)
    val Blue = Color(0xFF5B8CFF)
    val Violet = Color(0xFFA066FF)
    val Text = Color(0xFFFFFFFF)
    val TextDim = Color(0xFFB6BCD6)
    val TextFaint = Color(0xFF6F7694)
    val Hairline = Color(0x3D8296FF)

    val Accent = Brush.linearGradient(listOf(Cyan, Blue, Violet))
    val AccentHorizontal = Brush.horizontalGradient(listOf(Cyan, Blue, Violet))
    val Edge = Brush.linearGradient(listOf(Cyan.copy(alpha = 0.55f), Blue.copy(alpha = 0.25f), Violet.copy(alpha = 0.55f)))
}

private val colors = darkColorScheme(
    primary = Swar.Blue,
    onPrimary = Color.White,
    secondary = Swar.Cyan,
    tertiary = Swar.Violet,
    background = Swar.Space,
    onBackground = Swar.Text,
    surface = Color(0xFF0C0E1A),
    onSurface = Swar.Text,
    surfaceVariant = Color(0xFF151933),
    onSurfaceVariant = Swar.TextDim,
    surfaceContainer = Color(0xFF0E1122),
    surfaceContainerHigh = Color(0xFF14182E),
    surfaceContainerHighest = Color(0xFF1A1F3A),
    surfaceContainerLow = Color(0xFF0A0C18),
    outline = Swar.Hairline,
    outlineVariant = Color(0x2A8296FF),
    error = Color(0xFFFF6B8B),
)

private val type = Typography(
    headlineLarge = TextStyle(fontSize = 30.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.5).sp),
    headlineMedium = TextStyle(fontSize = 24.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.3).sp),
    titleLarge = TextStyle(fontSize = 20.sp, fontWeight = FontWeight.SemiBold),
    titleMedium = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.SemiBold),
    titleSmall = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.Medium),
    bodyLarge = TextStyle(fontSize = 15.sp),
    bodyMedium = TextStyle(fontSize = 13.sp),
    bodySmall = TextStyle(fontSize = 12.sp),
    labelLarge = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.2.sp),
    labelMedium = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.3.sp),
    labelSmall = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.4.sp),
)

@Composable
fun SwarTheme(content: @Composable () -> Unit) = MaterialTheme(colorScheme = colors, typography = type, content = content)

/**
 * The aurora backdrop: two soft glows on deep space. Static gradients drawn
 * once per frame of a size change, no blur. [tint] lets the player glow in
 * the colour of the album art.
 */
@Composable
fun Aurora(
    modifier: Modifier = Modifier,
    tint: Color = Swar.Cyan,
    tint2: Color = Swar.Violet,
    strength: Float = 1f,
    content: @Composable BoxScope.() -> Unit,
) {
    Box(
        modifier
            .fillMaxSize()
            .background(Swar.Space)
            .drawBehind {
                drawRect(
                    Brush.radialGradient(
                        listOf(tint.copy(alpha = 0.20f * strength), Color.Transparent),
                        center = Offset(size.width * 0.05f, size.height * 0.02f),
                        radius = size.maxDimension * 0.75f,
                    ),
                )
                drawRect(
                    Brush.radialGradient(
                        listOf(tint2.copy(alpha = 0.22f * strength), Color.Transparent),
                        center = Offset(size.width * 1.0f, size.height * 0.95f),
                        radius = size.maxDimension * 0.8f,
                    ),
                )
            },
        content = content,
    )
}

/** A glass panel with a gradient hairline edge. */
fun Modifier.glass(shape: Shape = RoundedCornerShape(20.dp), edge: Dp = 1.dp, fill: Color = Swar.Glass): Modifier =
    this.background(fill, shape).border(edge, Swar.Edge, shape)
