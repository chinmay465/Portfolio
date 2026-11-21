package com.chinmay.kavach

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.VpnService
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.widget.ArrayAdapter
import android.widget.EditText
import android.widget.FrameLayout
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
import com.chinmay.kavach.vpn.DomainRules
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.DateFormat
import java.text.NumberFormat
import java.util.Date

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var listAdapter: ArrayAdapter<String>
    private val numbers = NumberFormat.getIntegerInstance()

    /** What each row of the list stands for, in the same order as the adapter. */
    private var rows: List<AdBlockState.Lookup> = emptyList()

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

        listAdapter = ArrayAdapter(this, R.layout.item_domain, R.id.domain, mutableListOf<String>())
        binding.recentList.adapter = listAdapter
        binding.recentList.emptyView = binding.recentEmpty
        binding.recentList.setOnItemClickListener { _, _, position, _ ->
            rows.getOrNull(position)?.let { row ->
                if (row.blocked) confirmAllow(row.domain) else confirmBlock(row.domain)
            }
        }

        binding.toggle.setOnClickListener {
            if (AdBlockState.running.value) AdBlockVpnService.stop(this) else requestStart()
        }
        binding.liveSwitch.isChecked = AdBlockState.liveLookups.value
        binding.liveSwitch.setOnCheckedChangeListener { _, checked -> AdBlockState.setLiveLookups(checked) }
        binding.updateList.setOnClickListener { updateBlocklist() }
        binding.blockDomain.setOnClickListener { promptBlockDomain() }
        binding.myRules.setOnClickListener { showRules() }
        binding.clearList.setOnClickListener {
            AdBlockState.clearLists()
            Toast.makeText(this, R.string.list_cleared, Toast.LENGTH_SHORT).show()
        }
        binding.exportList.setOnClickListener { exportList() }

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
                    AdBlockState.ruleCount.collect {
                        binding.myRules.text =
                            if (it > 0) getString(R.string.my_rules_count, it) else getString(R.string.my_rules)
                    }
                }
                launch {
                    combine(
                        AdBlockState.liveLookups,
                        AdBlockState.recentLookups,
                        AdBlockState.recentBlocked,
                    ) { live, lookups, blocked ->
                        live to if (live) lookups else blocked.map { AdBlockState.Lookup(it, true) }
                    }.collect { (live, list) -> renderList(live, list) }
                }
            }
        }
    }

    private fun renderList(live: Boolean, list: List<AdBlockState.Lookup>) {
        if (binding.liveSwitch.isChecked != live) binding.liveSwitch.isChecked = live
        binding.listHeader.setText(if (live) R.string.live_header else R.string.recent_header)
        binding.recentEmpty.setText(if (live) R.string.live_empty else R.string.recent_empty)
        rows = list
        listAdapter.clear()
        listAdapter.addAll(
            list.map {
                getString(if (it.blocked) R.string.lookup_blocked else R.string.lookup_allowed, it.domain)
            },
        )
    }

    /**
     * Shares the list currently on screen as plain text through Android's
     * share sheet (copy, Files, chat apps...). Only happens when you tap
     * Export; Kavach itself never writes the list to storage.
     */
    private fun exportList() {
        if (rows.isEmpty()) {
            Toast.makeText(this, R.string.export_empty, Toast.LENGTH_SHORT).show()
            return
        }
        val now = DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(Date())
        val header = getString(
            if (AdBlockState.liveLookups.value) R.string.export_header_live else R.string.export_header_blocked,
            now,
        )
        val text = buildString {
            appendLine(header)
            appendLine(getString(R.string.export_legend))
            appendLine()
            rows.forEach { appendLine((if (it.blocked) "✕ " else "· ") + it.domain) }
        }
        val send = Intent(Intent.ACTION_SEND)
            .setType("text/plain")
            .putExtra(Intent.EXTRA_SUBJECT, getString(R.string.export_subject, now))
            .putExtra(Intent.EXTRA_TEXT, text)
        startActivity(Intent.createChooser(send, getString(R.string.export_chooser)))
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
                toastWithRestartHint(getString(R.string.allowed_toast, domain))
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun confirmBlock(domain: String) {
        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.block_title)
            .setMessage(getString(R.string.block_message, domain))
            .setPositiveButton(R.string.block) { _, _ -> block(domain) }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun block(domain: String) {
        Blocklist.block(this, domain)
        toastWithRestartHint(getString(R.string.blocked_toast, domain))
    }

    private fun promptBlockDomain() {
        val input = EditText(this).apply {
            hint = getString(R.string.block_hint)
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            isSingleLine = true
        }
        val pad = (20 * resources.displayMetrics.density).toInt()
        val container = FrameLayout(this).apply {
            setPadding(pad, pad / 2, pad, 0)
            addView(input)
        }
        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.block_domain)
            .setView(container)
            .setPositiveButton(R.string.block) { _, _ ->
                val domain = DomainRules.normalize(input.text.toString())
                if (domain == null) {
                    Toast.makeText(this, R.string.invalid_domain, Toast.LENGTH_LONG).show()
                } else {
                    block(domain)
                }
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun showRules() {
        val (blocks, allows) = Blocklist.rules(this)
        val entries = blocks.map { it to true } + allows.map { it to false }
        val builder = MaterialAlertDialogBuilder(this)
            .setTitle(if (entries.isEmpty()) R.string.my_rules else R.string.rules_remove_hint)
        if (entries.isEmpty()) {
            builder.setMessage(R.string.rules_empty)
        } else {
            val labels = entries.map { (d, isBlock) ->
                getString(if (isBlock) R.string.rule_blocked else R.string.rule_allowed, d)
            }.toTypedArray()
            builder.setItems(labels) { _, which ->
                val (domain, isBlock) = entries[which]
                Blocklist.removeRule(this, domain, wasBlock = isBlock)
                Toast.makeText(this, R.string.rule_removed, Toast.LENGTH_SHORT).show()
            }
        }
        builder.setPositiveButton(android.R.string.ok, null).show()
    }

    private fun toastWithRestartHint(action: String) {
        Toast.makeText(this, getString(R.string.restart_app_hint, action), Toast.LENGTH_LONG).show()
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
