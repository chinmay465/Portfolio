package com.chinmay.swar.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.NorthWest
import androidx.compose.material.icons.rounded.Search
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.chinmay.swar.data.SearchFilter
import com.chinmay.swar.data.Song
import com.chinmay.swar.ui.ErrorState
import com.chinmay.swar.ui.ListRowItem
import com.chinmay.swar.ui.Loading
import com.chinmay.swar.ui.LocalActions
import com.chinmay.swar.ui.SongRow
import com.chinmay.swar.ui.section
import com.chinmay.swar.ui.theme.Swar
import com.chinmay.swar.ui.theme.glass

@Composable
fun SearchScreen(bottomPadding: PaddingValues) {
    val context = LocalContext.current
    val model: SearchModel = viewModel { SearchModel(context) }
    val actions = LocalActions.current
    val focus = remember { FocusRequester() }
    val focusManager = LocalFocusManager.current
    var focused by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { if (model.submitted.isEmpty()) focus.requestFocus() }

    Column(Modifier.fillMaxSize()) {
        // Search field
        Row(
            Modifier
                .windowInsetsPadding(WindowInsets.statusBars)
                .padding(horizontal = 14.dp, vertical = 10.dp)
                .fillMaxWidth()
                .height(52.dp)
                .glass(RoundedCornerShape(26.dp))
                .padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Rounded.Search, null, tint = Swar.Cyan)
            Box(Modifier.weight(1f).padding(horizontal = 10.dp)) {
                if (model.query.isEmpty()) {
                    Text("Songs, artists, albums…", color = Swar.TextFaint, style = MaterialTheme.typography.bodyLarge)
                }
                BasicTextField(
                    value = model.query,
                    onValueChange = model::type,
                    singleLine = true,
                    textStyle = MaterialTheme.typography.bodyLarge.copy(color = Swar.Text),
                    cursorBrush = SolidColor(Swar.Cyan),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                    keyboardActions = KeyboardActions(onSearch = { model.submit(); focusManager.clearFocus() }),
                    modifier = Modifier.fillMaxWidth().focusRequester(focus).onFocusChanged { focused = it.isFocused },
                )
            }
            if (model.query.isNotEmpty()) {
                IconButton(onClick = { model.type(""); model.clearResults(); focus.requestFocus() }) {
                    Icon(Icons.Rounded.Close, "Clear", tint = Swar.TextDim)
                }
            }
        }

        val typing = focused && (model.submitted.isEmpty() || model.query != model.submitted)
        if (typing || model.results == null) {
            Suggestions(model, bottomPadding) { q -> model.submit(q); focusManager.clearFocus() }
            return@Column
        }

        LazyRow(contentPadding = PaddingValues(horizontal = 14.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(SearchFilter.entries) { f ->
                val shape = RoundedCornerShape(20.dp)
                val selected = f == model.filter
                Box(
                    Modifier.clip(shape)
                        .then(if (selected) Modifier.background(Swar.AccentHorizontal, shape) else Modifier.background(Swar.GlassLight, shape).border(1.dp, Swar.Hairline, shape))
                        .clickable { model.chooseFilter(f) }
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                ) { Text(f.label, style = MaterialTheme.typography.labelLarge) }
            }
        }

        LazyColumn(Modifier.fillMaxSize(), contentPadding = bottomPadding) {
            when (val r = model.results) {
                null, is Load.Loading -> item { Loading() }
                is Load.Failed -> item { ErrorState(r.message, { model.submit(model.submitted, model.filter) }) }
                is Load.Ready -> {
                    val sections = r.value.sections
                    if (sections.isEmpty()) item {
                        Text("No results for “${model.submitted}”", Modifier.padding(24.dp), color = Swar.TextDim)
                    }
                    if (model.filter == SearchFilter.ALL) {
                        sections.forEachIndexed { i, s -> section(s, "r$i", actions, radio = true) }
                    } else {
                        // One long list: songs play with their radio, everything else opens.
                        val all = sections.flatMap { it.items } + model.moreItems
                        all.forEachIndexed { i, it ->
                            item(key = "f$i") {
                                if (it is Song) SongRow(it, onClick = { actions.open(it) }) else ListRowItem(it)
                            }
                        }
                        if (model.canLoadMore) item(key = "more-${model.moreItems.size}") {
                            LaunchedEffect(Unit) { model.loadMore() }
                            Loading()
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Suggestions(model: SearchModel, bottomPadding: PaddingValues, onPick: (String) -> Unit) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = bottomPadding) {
        val list = if (model.query.isBlank()) model.recent.toList() else model.suggestions
        if (model.query.isBlank() && list.isNotEmpty()) item {
            Text("Recent searches", Modifier.padding(start = 20.dp, top = 12.dp, bottom = 4.dp), style = MaterialTheme.typography.labelMedium, color = Swar.Cyan)
        }
        items(list) { q ->
            Row(
                Modifier.fillMaxWidth().clickable { onPick(q) }.padding(horizontal = 20.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(if (model.query.isBlank()) Icons.Rounded.History else Icons.Rounded.Search, null, tint = Swar.TextFaint, modifier = Modifier.size(20.dp))
                Text(q, Modifier.weight(1f).padding(horizontal = 14.dp), style = MaterialTheme.typography.bodyLarge)
                if (model.query.isBlank()) {
                    IconButton(onClick = { model.forget(q) }) { Icon(Icons.Rounded.Close, "Remove", tint = Swar.TextFaint, modifier = Modifier.size(18.dp)) }
                } else {
                    IconButton(onClick = { model.type(q) }) { Icon(Icons.Rounded.NorthWest, "Edit", tint = Swar.TextFaint, modifier = Modifier.size(18.dp)) }
                }
            }
        }
    }
}
