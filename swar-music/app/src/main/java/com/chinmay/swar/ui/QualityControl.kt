package com.chinmay.swar.ui

import android.app.Activity
import android.app.Dialog
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.Window
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.TextView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.chinmay.swar.R
import com.chinmay.swar.web.AudioQuality

/**
 * The Audio quality chip on the player page ("Auto · 128 kbps") and the
 * picker it opens. The page script reports what's playing; the chip shows
 * only while YouTube Music's full-screen player is open.
 */
class QualityControl(
    private val activity: Activity,
    private val chip: TextView,
    initial: AudioQuality,
    private val onChange: (AudioQuality) -> Unit,
) {
    /** What's playing, from the page: codec and bitrate, and the best on offer for this song. */
    data class Playing(
        val codec: String = "",
        val kbps: Int = 0,
        val best: Int = 0,
        val measured: Boolean = false,
        /** Bitrate on offer per tier for this song; 0 = not offered. Empty = not known yet. */
        val tiers: Map<AudioQuality, Int> = emptyMap(),
    )

    var quality: AudioQuality = initial
        private set
    private var playing = Playing()
    private var dialog: Dialog? = null

    init {
        chip.setOnClickListener { showPicker() }
        render()
    }

    fun update(playerOpen: Boolean, playing: Playing) {
        this.playing = playing
        render()
        if (playerOpen) show() else hide()
    }

    fun hide() {
        if (chip.visibility != View.VISIBLE) return
        chip.animate().cancel()
        chip.animate().alpha(0f).setDuration(150).withEndAction { chip.visibility = View.GONE }.start()
    }

    private fun show() {
        if (chip.visibility == View.VISIBLE && chip.alpha == 1f) return
        chip.animate().cancel()
        if (chip.visibility != View.VISIBLE) {
            chip.alpha = 0f
            chip.visibility = View.VISIBLE
        }
        chip.animate().alpha(1f).setDuration(200).start()
    }

    /** "Opus · 128 kbps", "~128 kbps" when measured without a known codec, or "" when unknown. */
    fun label(p: Playing): String {
        if (p.kbps <= 0) return ""
        val rate = activity.getString(if (p.measured) R.string.quality_rate_measured else R.string.quality_rate, p.kbps)
        return if (p.codec.isBlank()) rate else "${p.codec} · $rate"
    }

    private fun render() {
        val name = activity.getString(label(quality))
        val rate = if (playing.kbps > 0) {
            activity.getString(if (playing.measured) R.string.quality_rate_measured else R.string.quality_rate, playing.kbps)
        } else {
            activity.getString(R.string.quality_rate_unknown)
        }
        chip.text = activity.getString(R.string.quality_chip, name, rate)
        chip.contentDescription = activity.getString(R.string.quality_chip_description, chip.text)
    }

    /** Bottom sheet in Swar's own layout, so it looks the same whatever the phone's dialog theme. */
    private fun showPicker() {
        if (dialog?.isShowing == true || activity.isFinishing) return
        val inflater = LayoutInflater.from(activity)
        val content = inflater.inflate(R.layout.dialog_quality, null)
        content.findViewById<TextView>(R.id.quality_now).text = nowText()
        val list = content.findViewById<LinearLayout>(R.id.quality_options)
        val sheet = Dialog(activity)
        for (q in AudioQuality.entries) {
            val row = inflater.inflate(R.layout.item_quality_option, list, false)
            val enabled = offered(q)
            row.findViewById<TextView>(R.id.option_title).text = optionTitle(q)
            row.findViewById<TextView>(R.id.option_detail).text = optionDetail(q)
            row.findViewById<RadioButton>(R.id.option_radio).isChecked = q == quality
            row.alpha = if (enabled) 1f else 0.38f
            row.isEnabled = enabled
            row.contentDescription = "${optionTitle(q)}. ${optionDetail(q)}"
            if (enabled) {
                row.setOnClickListener {
                    pick(q)
                    sheet.dismiss()
                }
            }
            list.addView(row)
        }
        // Keep the sheet clear of the gesture/navigation bar.
        ViewCompat.setOnApplyWindowInsetsListener(content) { v, insets ->
            val bottom = insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom
            v.setPadding(v.paddingLeft, v.paddingTop, v.paddingRight, sheetPaddingBottom + bottom)
            insets
        }
        sheet.requestWindowFeature(Window.FEATURE_NO_TITLE)
        sheet.setContentView(content)
        sheet.setCanceledOnTouchOutside(true)
        sheet.window?.apply {
            setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
            setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            setGravity(Gravity.BOTTOM)
            setWindowAnimations(android.R.style.Animation_InputMethod) // slides up from the bottom
            setDimAmount(0.6f)
        }
        sheet.show()
        dialog = sheet
    }

    private val sheetPaddingBottom by lazy { (20 * activity.resources.displayMetrics.density).toInt() }

    private fun pick(q: AudioQuality) {
        if (q == quality) return
        quality = q
        render()
        onChange(q)
    }

    private fun nowText(): String {
        val applies = activity.getString(R.string.quality_applies)
        if (playing.kbps <= 0) return applies
        val now = activity.getString(
            if (playing.measured) R.string.quality_now_measured else R.string.quality_now,
            playing.codec.ifBlank { activity.getString(R.string.quality_codec_unknown) },
            playing.kbps,
        )
        val best = if (playing.best <= 0) {
            ""
        } else if (playing.best > playing.kbps) {
            activity.getString(R.string.quality_best, playing.best)
        } else {
            activity.getString(R.string.quality_is_best)
        }
        return "$now $best".trim() + "\n" + applies
    }

    /** Auto always; a tier only if this song offers it (or before anything is known). */
    private fun offered(q: AudioQuality): Boolean =
        q == AudioQuality.AUTO || playing.tiers.isEmpty() || (playing.tiers[q] ?: 0) > 0

    private fun optionTitle(q: AudioQuality): String {
        val rate = playing.tiers[q] ?: 0
        val name = activity.getString(label(q))
        return if (q != AudioQuality.AUTO && rate > 0) activity.getString(R.string.quality_option_rate, name, rate) else name
    }

    private fun optionDetail(q: AudioQuality): String = activity.getString(
        when {
            !offered(q) && q == AudioQuality.HIGH -> R.string.quality_high_unavailable
            !offered(q) -> R.string.quality_unavailable
            q == AudioQuality.AUTO -> R.string.quality_auto_detail
            q == AudioQuality.HIGH -> R.string.quality_high_detail
            q == AudioQuality.NORMAL -> R.string.quality_normal_detail
            else -> R.string.quality_low_detail
        },
    )

    fun release() {
        dialog?.dismiss()
        dialog = null
    }

    private companion object {
        fun label(q: AudioQuality) = when (q) {
            AudioQuality.AUTO -> R.string.quality_auto
            AudioQuality.HIGH -> R.string.quality_high
            AudioQuality.NORMAL -> R.string.quality_normal
            AudioQuality.LOW -> R.string.quality_low
        }
    }
}
