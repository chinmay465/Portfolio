package com.chinmay.swar.ui.screens

import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chinmay.swar.data.YtMusic
import com.chinmay.swar.playback.AudioQuality
import com.chinmay.swar.playback.Streams
import com.chinmay.swar.ui.LoginActivity
import com.chinmay.swar.ui.theme.Swar
import com.chinmay.swar.ui.theme.glass

@Composable
fun SettingsScreen(bottomPadding: PaddingValues, onBack: () -> Unit) {
    val context = LocalContext.current
    val signedIn by YtMusic.account.signedIn.collectAsStateWithLifecycle()
    val quality by Streams.quality.collectAsStateWithLifecycle()
    val version = runCatching { context.packageManager.getPackageInfo(context.packageName, 0).versionName }.getOrNull().orEmpty()

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottomPadding)) {
        Row(
            Modifier.fillMaxWidth().windowInsetsPadding(WindowInsets.statusBars).padding(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") }
            Text("Settings", style = MaterialTheme.typography.headlineMedium)
        }

        Group("Account") {
            if (signedIn) {
                Text("Signed in to YouTube Music.", style = MaterialTheme.typography.bodyMedium, color = Swar.TextDim)
                TextButton(onClick = { YtMusic.account.signOut() }) { Text("Sign out", color = Swar.Cyan) }
            } else {
                Text("Signed out: Home is general, and Library and likes need an account.", style = MaterialTheme.typography.bodyMedium, color = Swar.TextDim)
                TextButton(onClick = { context.startActivity(Intent(context, LoginActivity::class.java)) }) { Text("Sign in", color = Swar.Cyan) }
            }
        }

        Group("Audio quality") {
            AudioQuality.entries.forEach { q ->
                Row(
                    Modifier.fillMaxWidth().clickable { Streams.setQuality(q) }.padding(vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    RadioButton(selected = q == quality, onClick = { Streams.setQuality(q) }, colors = RadioButtonDefaults.colors(selectedColor = Swar.Cyan))
                    Column(Modifier.padding(start = 6.dp)) {
                        Text(q.label, style = MaterialTheme.typography.titleSmall)
                        Text(q.detail, style = MaterialTheme.typography.bodySmall, color = Swar.TextDim)
                    }
                }
            }
            Text(
                "Free accounts top out at about 128 kbps; 256 kbps is a YouTube Music Premium perk.",
                style = MaterialTheme.typography.bodySmall, color = Swar.TextFaint, modifier = Modifier.padding(top = 6.dp),
            )
        }

        Group("Storage") {
            Text("Songs you've played are kept for a while (up to 512 MB), so replays and seeking don't download them again.", style = MaterialTheme.typography.bodyMedium, color = Swar.TextDim)
            TextButton(onClick = {
                Streams.clearCache()
                Toast.makeText(context, "Cache cleared", Toast.LENGTH_SHORT).show()
            }) { Text("Clear cache", color = Swar.Cyan) }
        }

        Group("About") {
            Text("Swar $version", style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.height(4.dp))
            Text(
                "A YouTube Music player of its own. Audio streams are found with NewPipe Extractor (GPLv3). " +
                    "No ads, no tracking: the only servers Swar talks to are YouTube's and Google's.",
                style = MaterialTheme.typography.bodySmall, color = Swar.TextDim,
            )
        }
    }
}

@Composable
private fun Group(title: String, content: @Composable () -> Unit) {
    Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp).fillMaxWidth().glass(RoundedCornerShape(20.dp)).padding(18.dp)) {
        Text(title.uppercase(), style = MaterialTheme.typography.labelSmall, color = Swar.Cyan)
        Spacer(Modifier.height(8.dp))
        content()
    }
}
