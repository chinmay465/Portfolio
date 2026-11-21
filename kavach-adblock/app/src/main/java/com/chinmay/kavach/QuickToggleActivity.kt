package com.chinmay.kavach

import android.app.Activity
import android.content.Intent
import android.net.VpnService
import android.os.Bundle
import android.widget.Toast
import com.chinmay.kavach.vpn.AdBlockState
import com.chinmay.kavach.vpn.AdBlockVpnService

/**
 * Invisible launcher entries ("Kavach On" / "Kavach Off") that switch
 * protection and close at once. They exist so automation such as Samsung
 * Modes and Routines ("open an app") can turn Kavach on when JioHotstar opens.
 */
abstract class QuickToggleActivity(private val turnOn: Boolean) : Activity() {

    private var handled = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        handled = savedInstanceState?.getBoolean(KEY_HANDLED) ?: false
    }

    // Done in onResume, while this (transparent) activity is in front, so
    // Android allows starting the VPN's foreground service.
    override fun onResume() {
        super.onResume()
        if (handled) {
            finish()
            return
        }
        handled = true
        if (turnOn) switchOn() else switchOff()
        finish()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putBoolean(KEY_HANDLED, handled)
    }

    private fun switchOn() {
        if (AdBlockState.running.value) return
        if (VpnService.prepare(this) != null) {
            // VPN permission hasn't been granted yet: open the app so the user can.
            startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            Toast.makeText(this, R.string.quick_needs_setup, Toast.LENGTH_LONG).show()
            return
        }
        AdBlockVpnService.start(this)
        Toast.makeText(this, R.string.quick_on, Toast.LENGTH_SHORT).show()
    }

    private fun switchOff() {
        if (!AdBlockState.running.value) return
        AdBlockVpnService.stop(this)
        Toast.makeText(this, R.string.quick_off, Toast.LENGTH_SHORT).show()
    }

    private companion object {
        const val KEY_HANDLED = "handled"
    }
}

class KavachOnActivity : QuickToggleActivity(turnOn = true)

class KavachOffActivity : QuickToggleActivity(turnOn = false)
