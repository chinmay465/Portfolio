package com.chinmay.swar.ui

import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.LibraryMusic
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.chinmay.swar.data.Song
import com.chinmay.swar.playback.SwarPlayer
import com.chinmay.swar.ui.player.FullPlayer
import com.chinmay.swar.ui.player.MiniPlayer
import com.chinmay.swar.ui.screens.BrowseScreen
import com.chinmay.swar.ui.screens.HomeScreen
import com.chinmay.swar.ui.screens.LibraryScreen
import com.chinmay.swar.ui.screens.SearchScreen
import com.chinmay.swar.ui.screens.SettingsScreen
import com.chinmay.swar.ui.theme.Aurora
import com.chinmay.swar.ui.theme.Swar
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import kotlin.math.abs

private val NAV_HEIGHT = 64.dp
private val MINI_HEIGHT = 72.dp

/**
 * The app: tabs (Home, Search, Library) with their pages, the mini player
 * above the tabs, and the full player that slides up over everything. The
 * full player follows your finger: drag it down to close, drag the mini
 * player up to open.
 */
@Composable
fun SwarRoot(links: Flow<Uri>, openPlayer: Flow<Unit>) {
    val nav = rememberNavController()
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    /** 0 = mini player, 1 = full player. */
    val expand = remember { Animatable(0f) }
    val settle: (Float) -> Unit = { target ->
        scope.launch { expand.animateTo(target, spring(dampingRatio = 0.86f, stiffness = Spring.StiffnessMediumLow)) }
    }
    val actions = remember(nav) { Actions(nav) { settle(1f) } }
    val state by SwarPlayer.state.collectAsStateWithLifecycle()
    val hasSong = state.current != null

    LaunchedEffect(Unit) { SwarPlayer.messages.collect { Toast.makeText(context, it, Toast.LENGTH_SHORT).show() } }
    LaunchedEffect(Unit) { openPlayer.collect { if (SwarPlayer.state.value.current != null) settle(1f) } }
    LaunchedEffect(Unit) { links.collect { uri -> openLink(uri, actions) } }
    LaunchedEffect(hasSong) { if (!hasSong) expand.snapTo(0f) }

    BackHandler(enabled = expand.targetValue > 0.5f) { settle(0f) }

    CompositionLocalProvider(LocalActions provides actions) {
        Aurora {
            BoxWithConstraints(Modifier.fillMaxSize()) {
                val heightPx = with(LocalDensity.current) { maxHeight.toPx() }
                val navInset = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
                val bottom = PaddingValues(bottom = NAV_HEIGHT + navInset + (if (hasSong) MINI_HEIGHT else 0.dp) + 12.dp)
                val drag = rememberDraggableState { delta ->
                    scope.launch { expand.snapTo((expand.value - delta / heightPx).coerceIn(0f, 1f)) }
                }
                val onDragStopped: suspend (Float) -> Unit = { velocity ->
                    val target = when {
                        abs(velocity) > 900f -> if (velocity > 0) 0f else 1f
                        else -> if (expand.value > 0.5f) 1f else 0f
                    }
                    settle(target)
                }

                NavHost(nav, startDestination = Routes.HOME, modifier = Modifier.fillMaxSize()) {
                    composable(Routes.HOME) { HomeScreen(bottom) }
                    composable(Routes.SEARCH) { SearchScreen(bottom) }
                    composable(Routes.LIBRARY) { LibraryScreen(bottom, onSettings = { nav.navigate(Routes.SETTINGS) }) }
                    composable(Routes.SETTINGS) { SettingsScreen(bottom, onBack = { nav.popBackStack() }) }
                    composable(
                        Routes.BROWSE,
                        arguments = listOf(
                            navArgument("id") { type = NavType.StringType },
                            navArgument("params") { type = NavType.StringType; nullable = true; defaultValue = null },
                        ),
                    ) { entry ->
                        BrowseScreen(
                            browseId = entry.arguments?.getString("id").orEmpty(),
                            params = entry.arguments?.getString("params"),
                            bottomPadding = bottom,
                            onBack = { nav.popBackStack() },
                        )
                    }
                }

                // Mini player + tabs, sliding away as the full player comes up.
                Column(
                    Modifier.align(Alignment.BottomCenter).fillMaxWidth().graphicsLayer {
                        translationY = expand.value * (NAV_HEIGHT + MINI_HEIGHT + navInset).toPx()
                        alpha = 1f - expand.value
                    },
                ) {
                    if (hasSong) {
                        MiniPlayer(
                            Modifier.padding(bottom = 6.dp).draggable(drag, Orientation.Vertical, onDragStopped = { onDragStopped(it) }),
                            onOpen = { settle(1f) },
                        )
                    }
                    BottomBar(nav)
                }

                // Full player.
                if (hasSong && (expand.value > 0f || expand.targetValue > 0f)) {
                    FullPlayer(
                        onClose = { settle(0f) },
                        modifier = Modifier
                            .graphicsLayer { translationY = (1f - expand.value) * heightPx }
                            .draggable(drag, Orientation.Vertical, onDragStopped = { onDragStopped(it) }),
                    )
                }
            }
        }
        actions.menuFor?.let { item -> ItemMenu(item, onDismiss = { actions.menuFor = null }, beforeNavigate = { settle(0f) }) }
    }
}

@Composable
private fun BottomBar(nav: NavHostController) {
    val entry by nav.currentBackStackEntryAsState()
    val route = entry?.destination?.route
    // Pages opened from a tab (albums, settings) keep that tab lit.
    var tab by rememberSaveable { mutableStateOf(Routes.HOME) }
    LaunchedEffect(route) { if (route == Routes.HOME || route == Routes.SEARCH || route == Routes.LIBRARY) tab = route }
    Row(
        Modifier.fillMaxWidth()
            .background(Swar.Glass)
            .windowInsetsPadding(WindowInsets.navigationBars)
            .height(NAV_HEIGHT),
        horizontalArrangement = Arrangement.SpaceEvenly,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Tab(Icons.Rounded.Home, "Home", tab == Routes.HOME) { nav.switchTo(Routes.HOME) }
        Tab(Icons.Rounded.Search, "Search", tab == Routes.SEARCH) { nav.switchTo(Routes.SEARCH) }
        Tab(Icons.Rounded.LibraryMusic, "Library", tab == Routes.LIBRARY) { nav.switchTo(Routes.LIBRARY) }
    }
}

private fun NavHostController.switchTo(route: String) {
    navigate(route) {
        popUpTo(graph.startDestinationId) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}

@Composable
private fun Tab(icon: ImageVector, label: String, selected: Boolean, onClick: () -> Unit) {
    Column(
        Modifier.clip(CircleShape).clickable(onClick = onClick).padding(horizontal = 22.dp, vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(icon, label, tint = if (selected) Swar.Cyan else Swar.TextFaint)
        Text(label, style = MaterialTheme.typography.labelSmall, color = if (selected) Swar.Text else Swar.TextFaint)
        Spacer(Modifier.height(3.dp))
        Box(Modifier.size(width = 16.dp, height = 2.dp).clip(CircleShape).background(if (selected) Swar.AccentHorizontal else SolidColor(Color.Transparent)))
    }
}

/** Shared music.youtube.com links: play a song, open a playlist, album or artist. */
private fun openLink(uri: Uri, actions: Actions) {
    val path = uri.path.orEmpty()
    val list = uri.getQueryParameter("list")
    val video = uri.getQueryParameter("v")
    when {
        path.startsWith("/watch") && video != null -> SwarPlayer.playRadio(Song(videoId = video, title = ""))
        path.startsWith("/playlist") && list != null -> actions.browse("VL$list")
        path.startsWith("/browse/") -> actions.browse(path.removePrefix("/browse/"))
        path.startsWith("/channel/") -> actions.browse(path.removePrefix("/channel/"))
        list != null -> SwarPlayer.playPlaylist(list)
    }
}
