package com.chinmay.swar.ui

import android.app.Activity
import android.app.AlertDialog
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.text.style.RelativeSizeSpan
import android.view.LayoutInflater
import android.view.View
import android.widget.TextView
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
    data class Playing(val codec: String = "", val kbps: Int = 0, val best: Int = 0)

    var quality: AudioQuality = initial
        private set
    private var playing = Playing()
    private var dialog: AlertDialog? = null

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

    private fun render() {
        val name = activity.getString(label(quality))
        chip.text = if (playing.kbps > 0) activity.getString(R.string.quality_chip, name, playing.kbps) else name
        chip.contentDescription = activity.getString(R.string.quality_chip_description, chip.text)
    }

    private fun showPicker() {
        if (dialog?.isShowing == true || activity.isFinishing) return
        val options = AudioQuality.entries
        val items = options.map { option(it) }.toTypedArray<CharSequence>()
        val header = LayoutInflater.from(activity).inflate(R.layout.dialog_quality_title, null)
        header.findViewById<TextView>(R.id.quality_now).text = nowText()
        dialog = AlertDialog.Builder(activity)
            .setCustomTitle(header)
            .setSingleChoiceItems(items, options.indexOf(quality)) { d, which ->
                val picked = options[which]
                if (picked != quality) {
                    quality = picked
                    render()
                    onChange(picked)
                }
                d.dismiss()
            }
            .setNegativeButton(R.string.crash_dismiss, null)
            .show()
    }

    private fun nowText(): String {
        val applies = activity.getString(R.string.quality_applies)
        if (playing.kbps <= 0) return applies
        val now = activity.getString(R.string.quality_now, playing.codec, playing.kbps)
        val best = if (playing.best > playing.kbps) {
            activity.getString(R.string.quality_best, playing.best)
        } else {
            activity.getString(R.string.quality_is_best)
        }
        return "$now $best\n$applies"
    }

    private fun option(q: AudioQuality): CharSequence {
        val title = activity.getString(label(q))
        val detail = activity.getString(
            when (q) {
                AudioQuality.AUTO -> R.string.quality_auto_detail
                AudioQuality.HIGH -> R.string.quality_high_detail
                AudioQuality.LOW -> R.string.quality_low_detail
            },
        )
        return SpannableStringBuilder(title).append('\n').apply {
            val start = length
            append(detail)
            setSpan(RelativeSizeSpan(0.82f), start, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            setSpan(ForegroundColorSpan(activity.getColor(R.color.text_secondary)), start, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
    }

    fun release() {
        dialog?.dismiss()
        dialog = null
    }

    private companion object {
        fun label(q: AudioQuality) = when (q) {
            AudioQuality.AUTO -> R.string.quality_auto
            AudioQuality.HIGH -> R.string.quality_high
            AudioQuality.LOW -> R.string.quality_low
        }
    }
}
