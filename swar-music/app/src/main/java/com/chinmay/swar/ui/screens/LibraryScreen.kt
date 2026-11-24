package com.chinmay.swar.ui.screens

import android.content.Intent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.PlaylistPlay
import androidx.compose.material.icons.rounded.Album
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chinmay.swar.data.AccountInfo
import com.chinmay.swar.data.LibraryShelf
import com.chinmay.swar.data.YtMusic
import com.chinmay.swar.ui.Artwork
import com.chinmay.swar.ui.GradientButton
import com.chinmay.swar.ui.LocalActions
import com.chinmay.swar.ui.LoginActivity
import com.chinmay.swar.ui.theme.Swar
import com.chinmay.swar.ui.theme.glass

@Composable
fun LibraryScreen(bottomPadding: PaddingValues, onSettings: () -> Unit) {
    val actions = LocalActions.current
    val context = LocalContext.current
    val signedIn by YtMusic.account.signedIn.collectAsStateWithLifecycle()
    var account by remember { mutableStateOf<AccountInfo?>(null) }
    LaunchedEffect(signedIn) {
        account = if (signedIn) runCatching { YtMusic.accountInfo() }.getOrNull() else null
    }

    LazyColumn(Modifier.fillMaxSize(), contentPadding = bottomPadding) {
        item {
            Row(
                Modifier.fillMaxWidth().windowInsetsPadding(WindowInsets.statusBars).padding(start = 20.dp, end = 8.dp, top = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Library", style = MaterialTheme.typography.headlineMedium, modifier = Modifier.weight(1f))
                IconButton(onClick = onSettings) { Icon(Icons.Rounded.Settings, "Settings", tint = Swar.TextDim) }
            }
        }
        if (!signedIn) {
            item {
                Column(
                    Modifier.padding(20.dp).fillMaxWidth().glass(RoundedCornerShape(24.dp)).padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text("Your music, everywhere", style = MaterialTheme.typography.titleLarge)
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Sign in with your Google account to see your liked songs, playlists, albums and history, and to get Home picked for you.",
                        style = MaterialTheme.typography.bodyMedium, color = Swar.TextDim,
                    )
                    Spacer(Modifier.height(20.dp))
                    GradientButton("Sign in", { context.startActivity(Intent(context, LoginActivity::class.java)) })
                }
            }
            return@LazyColumn
        }
        account?.let { a ->
            item {
                Row(Modifier.padding(horizontal = 20.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Artwork(a.photo, Modifier.size(44.dp), CircleShape)
                    Column(Modifier.padding(start = 12.dp)) {
                        Text(a.name, style = MaterialTheme.typography.titleMedium)
                        if (a.handle.isNotBlank()) Text(a.handle, style = MaterialTheme.typography.bodySmall, color = Swar.TextDim)
                    }
                }
            }
        }
        items(LibraryShelf.entries) { shelf ->
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 5.dp)
                    .glass(RoundedCornerShape(18.dp))
                    .clickable { actions.browse(shelf.browseId) }
                    .padding(horizontal = 18.dp, vertical = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Icon(shelf.icon(), null, tint = Swar.Cyan)
                Text(shelf.label, style = MaterialTheme.typography.titleMedium)
            }
        }
    }
}

private fun LibraryShelf.icon(): ImageVector = when (this) {
    LibraryShelf.LIKED -> Icons.Rounded.Favorite
    LibraryShelf.PLAYLISTS -> Icons.AutoMirrored.Rounded.PlaylistPlay
    LibraryShelf.ALBUMS -> Icons.Rounded.Album
    LibraryShelf.ARTISTS -> Icons.Rounded.Person
    LibraryShelf.HISTORY -> Icons.Rounded.History
}
