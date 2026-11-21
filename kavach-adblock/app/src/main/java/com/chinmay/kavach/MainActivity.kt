package com.chinmay.kavach

import android.Manifest
import android.content.pm.PackageManager
import android.net.VpnService
import android.os.Build
import android.os.Bundle
import android.widget.ArrayAdapter
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.chinmay.kavach.databinding.ActivityMainBinding
import com.chinmay.kavach.vpn.AdBlockState
import com.chinmay.kavach.vpn.AdBlockVpnService
import com.chinmay.kavach.vpn.Blocklist
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.NumberFormat

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var recentAdapter: ArrayAdapter<String>
    private val numbers = NumberFormat.getIntegerInstance()

    private val vpnConsent = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        if (result.resultCode == RESULT_OK) {
            AdBlockVpnService.start(this)
        } else {
            Toast.makeText(this, R.string.vpn_permission_denied, Toast.LENGTH_LONG).show()
        }
    }

    private val notificationPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { /* Optional: the VPN works without it, the notification just stays hidden. */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        askForNotificationPermission()

        recentAdapter = ArrayAdapter(this, R.layout.item_domain, R.id.domain, mutableListOf<String>())
        binding.recentList.adapter = recentAdapter
        binding.recentList.emptyView = binding.recentEmpty
        binding.recentList.setOnItemClickListener { _, _, position, _ ->
            recentAdapter.getItem(position)?.let(::confirmAllow)
        }

        binding.toggle.setOnClickListener {
            if (AdBlockState.running.value) AdBlockVpnService.stop(this) else requestStart()
        }
        binding.updateList.setOnClickListener { updateBlocklist() }
        binding.clearAllowlist.setOnClickListener {
            Blocklist.clearAllowlist(this)
            Toast.makeText(this, R.string.allowlist_cleared, Toast.LENGTH_SHORT).show()
        }

        observeState()

        lifecycleScope.launch {
            withContext(Dispatchers.IO) { Blocklist.ensureLoaded(applicationContext) }
            // First launch: fetch the full list; the bundled starter list works meanwhile.
            if (!Blocklist.hasDownloadedList(applicationContext)) updateBlocklist()
        }
    }

    private fun requestStart() {
        val consent = VpnService.prepare(this)
        if (consent != null) vpnConsent.launch(consent) else AdBlockVpnService.start(this)
    }

    private fun observeState() {
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                launch { AdBlockState.running.collect(::renderRunning) }
                launch {
                    AdBlockState.blocked.collect { binding.blockedCount.text = numbers.format(it) }
                }
                launch {
                    AdBlockState.queries.collect { binding.queryCount.text = numbers.format(it) }
                }
                launch {
                    AdBlockState.blocklistSize.collect { binding.listSize.text = numbers.format(it) }
                }
                launch {
                    AdBlockState.allowlistSize.collect {
                        binding.clearAllowlist.isEnabled = it > 0
                        binding.clearAllowlist.text = getString(R.string.clear_allowlist, it)
                    }
                }
                launch {
                    AdBlockState.recentBlocked.collect {
                        recentAdapter.clear()
                        recentAdapter.addAll(it)
                    }
                }
            }
        }
    }

    private fun renderRunning(running: Boolean) {
        val color = ContextCompat.getColor(this, if (running) R.color.shield_on else R.color.shield_off)
        binding.shield.setColorFilter(color)
        binding.status.setText(if (running) R.string.status_on else R.string.status_off)
        binding.toggle.setText(if (running) R.string.turn_off else R.string.turn_on)
    }

    private fun updateBlocklist() {
        binding.updateList.isEnabled = false
        binding.updateList.setText(R.string.updating)
        lifecycleScope.launch {
            val result = withContext(Dispatchers.IO) {
                runCatching { Blocklist.download(applicationContext) }
            }
            binding.updateList.isEnabled = true
            binding.updateList.setText(R.string.update_blocklist)
            val message = result.fold(
                onSuccess = { getString(R.string.blocklist_updated, numbers.format(it)) },
                onFailure = { getString(R.string.blocklist_failed, it.message ?: "") },
            )
            Toast.makeText(this@MainActivity, message, Toast.LENGTH_LONG).show()
        }
    }

    private fun confirmAllow(domain: String) {
        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.allow_title)
            .setMessage(getString(R.string.allow_message, domain))
            .setPositiveButton(R.string.allow) { _, _ ->
                Blocklist.allow(this, domain)
                AdBlockState.recentBlocked.value = AdBlockState.recentBlocked.value - domain
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun askForNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
}
