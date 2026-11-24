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
import com.chinmay.kavach.proxy.ProxySettings
import com.chinmay.kavach.proxy.SetuClient
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
    private lateinit var proxySettings: ProxySettings

    /** True while the code (not the user) flips the proxy switch. */
    private var settingProxySwitch = false
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

        proxySettings = ProxySettings(this)
        setProxySwitch(proxySettings.enabled)
        binding.proxySwitch.isEnabled = ProxySettings.supported
        binding.proxySwitch.setOnCheckedChangeListener { _, checked ->
            if (!settingProxySwitch) onProxySwitch(checked)
        }
        binding.proxyNext.setOnClickListener { AdBlockVpnService.nextProxy(this) }
        binding.proxySettings.setOnClickListener { showProxySettings() }

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
                    combine(
                        AdBlockState.running,
                        AdBlockState.proxy,
                        AdBlockState.proxyOk,
                        AdBlockState.proxyFailed,
                    ) { r, p, _, _ -> r to p }
                        .collect { (running, proxy) -> renderProxy(running, proxy) }
                }
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

    // ---- Proxy mode ----

    private fun setProxySwitch(on: Boolean) {
        settingProxySwitch = true
        binding.proxySwitch.isChecked = on
        settingProxySwitch = false
    }

    private fun onProxySwitch(on: Boolean) {
        if (!on) {
            proxySettings.enabled = false
            AdBlockVpnService.restartProxy(this)
            renderProxy(AdBlockState.running.value, AdBlockState.proxy.value)
            return
        }
        // Setu on Render needs its token, so ask for it the first time.
        if (proxySettings.token.isBlank()) {
            promptToken(onDone = ::enableProxy, onCancel = { setProxySwitch(false) })
        } else {
            enableProxy()
        }
    }

    private fun enableProxy() {
        proxySettings.enabled = true
        setProxySwitch(true)
        if (AdBlockState.running.value) AdBlockVpnService.restartProxy(this) else requestStart()
        renderProxy(AdBlockState.running.value, AdBlockState.proxy.value)
    }

    private fun renderProxy(running: Boolean, proxy: AdBlockState.Proxy) {
        val enabled = proxySettings.enabled
        binding.proxyNext.isEnabled = running && proxy is AdBlockState.Proxy.Active
        binding.proxyStatus.text = when {
            !ProxySettings.supported -> getString(R.string.proxy_status_unsupported)
            !enabled -> getString(R.string.proxy_status_off)
            !running -> getString(R.string.proxy_status_waiting)
            else -> when (proxy) {
                AdBlockState.Proxy.Off -> getString(R.string.proxy_status_fetching)
                is AdBlockState.Proxy.Connecting ->
                    if (proxy.total == 0) {
                        getString(R.string.proxy_status_fetching)
                    } else {
                        getString(R.string.proxy_status_testing, proxy.tested, proxy.total)
                    }
                is AdBlockState.Proxy.Active -> getString(
                    R.string.proxy_status_active,
                    proxy.address,
                    proxy.exitIp,
                    proxy.latencyMs,
                    proxy.poolSize,
                    AdBlockState.proxyOk.value,
                    AdBlockState.proxyFailed.value,
                )
                is AdBlockState.Proxy.Unavailable -> getString(
                    when (proxy.reason) {
                        AdBlockState.Proxy.Reason.AUTH -> R.string.proxy_status_auth
                        AdBlockState.Proxy.Reason.SETU_UNREACHABLE -> R.string.proxy_status_unreachable
                        AdBlockState.Proxy.Reason.NONE_WORKING -> R.string.proxy_status_none
                    },
                )
            }
        }
    }

    private fun rotateLabel(minutes: Int): String =
        if (minutes == 0) getString(R.string.proxy_rotate_on_fail) else getString(R.string.proxy_rotate_every, minutes)

    private fun showProxySettings() {
        val items = arrayOf(
            getString(R.string.proxy_setting_url, proxySettings.setuUrl.removePrefix("https://")),
            getString(
                if (proxySettings.token.isBlank()) R.string.proxy_setting_token_missing else R.string.proxy_setting_token_set,
            ),
            getString(R.string.proxy_setting_rotate, rotateLabel(proxySettings.rotateMinutes)),
            getString(R.string.proxy_setting_apps, installedBypassCount()),
        )
        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.proxy_settings)
            .setItems(items) { _, which ->
                when (which) {
                    0 -> promptUrl()
                    1 -> promptToken(onDone = { AdBlockVpnService.restartProxy(this) }, onCancel = {})
                    2 -> chooseRotate()
                    3 -> chooseBypassApps()
                }
            }
            .setPositiveButton(android.R.string.ok, null)
            .show()
    }

    private fun installedBypassCount(): Int = proxySettings.bypassApps.count { pkg ->
        try {
            packageManager.getApplicationInfo(pkg, 0)
            true
        } catch (_: PackageManager.NameNotFoundException) {
            false
        }
    }

    private fun textDialog(
        title: Int,
        message: Int?,
        value: String,
        hint: String,
        inputType: Int,
    ): Pair<MaterialAlertDialogBuilder, EditText> {
        val input = EditText(this).apply {
            setText(value)
            this.hint = hint
            this.inputType = inputType
            isSingleLine = true
        }
        val pad = (20 * resources.displayMetrics.density).toInt()
        val container = FrameLayout(this).apply {
            setPadding(pad, pad / 2, pad, 0)
            addView(input)
        }
        val builder = MaterialAlertDialogBuilder(this).setTitle(title).setView(container)
        if (message != null) builder.setMessage(message)
        return builder to input
    }

    private fun promptUrl() {
        val (builder, input) = textDialog(
            R.string.proxy_url_title,
            null,
            proxySettings.setuUrl,
            SetuClient.DEFAULT_URL,
            InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI,
        )
        builder
            .setPositiveButton(R.string.save) { _, _ ->
                val url = SetuClient.normalizeUrl(input.text.toString())
                if (url == null) {
                    Toast.makeText(this, R.string.proxy_url_invalid, Toast.LENGTH_LONG).show()
                } else {
                    proxySettings.setuUrl = url
                    AdBlockVpnService.restartProxy(this)
                }
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun promptToken(onDone: () -> Unit, onCancel: () -> Unit) {
        val (builder, input) = textDialog(
            R.string.proxy_token_title,
            R.string.proxy_token_message,
            proxySettings.token,
            getString(R.string.proxy_token_hint),
            InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD,
        )
        var handled = false
        builder
            .setPositiveButton(R.string.save) { _, _ ->
                handled = true
                proxySettings.token = input.text.toString()
                onDone()
            }
            .setNeutralButton(R.string.proxy_token_skip) { _, _ ->
                handled = true
                proxySettings.token = ""
                onDone()
            }
            .setNegativeButton(android.R.string.cancel, null)
            .setOnDismissListener { if (!handled) onCancel() }
            .show()
    }

    private fun chooseRotate() {
        val choices = ProxySettings.ROTATE_CHOICES
        val labels = choices.map(::rotateLabel).toTypedArray()
        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.proxy_rotate_title)
            .setSingleChoiceItems(labels, choices.indexOf(proxySettings.rotateMinutes).coerceAtLeast(0)) { d, which ->
                proxySettings.rotateMinutes = choices[which]
                d.dismiss()
            }
            .show()
    }

    private fun chooseBypassApps() {
        lifecycleScope.launch {
            val apps = withContext(Dispatchers.IO) {
                val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
                packageManager.queryIntentActivities(launcher, 0)
                    .map { it.activityInfo.packageName to it.loadLabel(packageManager).toString() }
                    .filter { it.first != packageName }
                    .distinctBy { it.first }
                    .sortedBy { it.second.lowercase() }
            }
            if (isFinishing) return@launch
            val current = proxySettings.bypassApps
            val checked = BooleanArray(apps.size) { apps[it].first in current }
            MaterialAlertDialogBuilder(this@MainActivity)
                .setTitle(R.string.proxy_apps_title)
                .setMultiChoiceItems(apps.map { it.second }.toTypedArray(), checked) { _, i, on -> checked[i] = on }
                .setPositiveButton(R.string.save) { _, _ ->
                    val listed = apps.map { it.first }.toSet()
                    // Keep defaults for apps that aren't installed, in case they're installed later.
                    proxySettings.bypassApps = (current - listed) + apps.filterIndexed { i, _ -> checked[i] }.map { it.first }
                    AdBlockVpnService.refreshProxyApps(this@MainActivity)
                    Toast.makeText(this@MainActivity, R.string.proxy_apps_note, Toast.LENGTH_LONG).show()
                }
                .setNegativeButton(android.R.string.cancel, null)
                .show()
        }
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
