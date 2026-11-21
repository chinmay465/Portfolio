package com.chinmay.swar.ui

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.util.AttributeSet
import android.view.View
import com.chinmay.swar.R
import kotlin.math.abs
import kotlin.math.sin

/** The logo's five bars, bouncing like a level meter. Used on the loading screen. */
class EqualizerView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : View(context, attrs) {

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val rect = RectF()
    private val speeds = floatArrayOf(4.1f, 5.3f, 3.4f, 6.1f, 4.7f)
    private val phases = floatArrayOf(0f, 1.1f, 2.3f, 0.6f, 1.7f)
    /** Resting heights, matching the launcher icon's bars. */
    private val rest = floatArrayOf(0.38f, 0.71f, 1f, 0.62f, 0.33f)
    private val startNs = System.nanoTime()
    private var animating = false

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        paint.shader = LinearGradient(
            0f, 0f, w.toFloat(), 0f,
            context.getColor(R.color.brand), context.getColor(R.color.brand_2),
            Shader.TileMode.CLAMP,
        )
    }

    override fun onVisibilityAggregated(isVisible: Boolean) {
        super.onVisibilityAggregated(isVisible)
        // Respect "Remove animations": draw the resting logo instead.
        animating = isVisible && ValueAnimator.areAnimatorsEnabled()
        if (animating) postInvalidateOnAnimation()
    }

    override fun onDraw(canvas: Canvas) {
        val n = rest.size
        val gap = width * 0.09f
        val barWidth = (width - gap * (n - 1)) / n
        val t = (System.nanoTime() - startNs) / 1_000_000_000f
        for (i in 0 until n) {
            val level = if (animating) 0.28f + 0.72f * abs(sin(t * speeds[i] / 2f + phases[i])) else rest[i]
            val barHeight = (height * level).coerceAtLeast(barWidth)
            val left = i * (barWidth + gap)
            val top = (height - barHeight) / 2f
            rect.set(left, top, left + barWidth, top + barHeight)
            canvas.drawRoundRect(rect, barWidth / 2f, barWidth / 2f, paint)
        }
        if (animating) postInvalidateOnAnimation()
    }
}
