package com.chinmay.swar.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.chinmay.swar.data.Chip
import com.chinmay.swar.data.YtMusic
import com.chinmay.swar.ui.ErrorState
import com.chinmay.swar.ui.Loading
import com.chinmay.swar.ui.LocalActions
import com.chinmay.swar.ui.section
import com.chinmay.swar.ui.theme.Swar

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(bottomPadding: PaddingValues, model: HomeModel = viewModel()) {
    val actions = LocalActions.current
    val signedIn by YtMusic.account.signedIn.collectAsStateWithLifecycle()
    var seen by remember { mutableStateOf(signedIn) }
    LaunchedEffect(signedIn) {
        // Signing in or out changes what Home shows.
        if (signedIn != seen) { seen = signedIn; model.load() }
    }
    PullToRefreshBox(isRefreshing = model.refreshing, onRefresh = { model.load(refresh = true) }, modifier = Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = bottomPadding) {
            item(key = "top") { Wordmark() }
            when (val p = model.page) {
                is Load.Loading -> item(key = "loading") { Loading() }
                is Load.Failed -> item(key = "error") { ErrorState(p.message, { model.load() }) }
                is Load.Ready -> {
                    if (p.value.chips.isNotEmpty()) item(key = "chips") { Chips(p.value.chips, model::chip) }
                    p.value.sections.forEachIndexed { i, s -> section(s, "s$i", actions, radio = true) }
                    model.more.forEachIndexed { i, s -> section(s, "m$i", actions, radio = true) }
                    if (model.canLoadMore) item(key = "more-${model.more.size}") {
                        LaunchedEffect(Unit) { model.loadMore() }
                        Loading()
                    }
                }
            }
        }
    }
}

@Composable
private fun Wordmark() {
    Row(
        Modifier.fillMaxWidth().windowInsetsPadding(WindowInsets.statusBars).padding(start = 20.dp, top = 14.dp, bottom = 4.dp),
    ) {
        Text(
            "SWAR",
            style = TextStyle(brush = Swar.AccentHorizontal, fontSize = 26.sp, fontWeight = FontWeight.Light, letterSpacing = 9.sp),
        )
    }
}

@Composable
fun Chips(chips: List<Chip>, onPick: (String?) -> Unit) {
    LazyRow(contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        items(chips) { chip ->
            val shape = RoundedCornerShape(20.dp)
            Box(
                Modifier
                    .clip(shape)
                    .then(
                        if (chip.selected) Modifier.background(Swar.AccentHorizontal, shape)
                        else Modifier.background(Swar.GlassLight, shape).border(1.dp, Swar.Hairline, shape),
                    )
                    .clickable { onPick(chip.params) }
                    .padding(horizontal = 16.dp, vertical = 8.dp),
            ) {
                Text(chip.title, style = MaterialTheme.typography.labelLarge, color = Swar.Text)
            }
        }
    }
}
