package com.chinmay.swar.ui.screens

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.chinmay.swar.data.Item
import com.chinmay.swar.data.Layout
import com.chinmay.swar.data.Page
import com.chinmay.swar.data.SearchFilter
import com.chinmay.swar.data.Section
import com.chinmay.swar.data.Song
import com.chinmay.swar.data.YtMusic
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.io.IOException
import java.net.SocketTimeoutException
import java.net.UnknownHostException

sealed interface Load<out T> {
    data object Loading : Load<Nothing>
    data class Ready<T>(val value: T) : Load<T>
    data class Failed(val message: String) : Load<Nothing>
}

fun Throwable.friendly(): String = when (this) {
    is UnknownHostException -> "No internet connection."
    is SocketTimeoutException -> "The connection timed out."
    is IOException -> message ?: "Network error."
    else -> message ?: javaClass.simpleName
}

/** A page with "load more": Home and every browse page. */
open class PageModel(private val fetch: suspend () -> Page) : ViewModel() {
    var page by mutableStateOf<Load<Page>>(Load.Loading)
        private set
    /** Sections loaded by scrolling further (Home). */
    val more = mutableStateListOf<Section>()
    /** Extra rows of the last list (long playlists). */
    val moreItems = mutableStateListOf<Item>()
    var refreshing by mutableStateOf(false)
        private set
    private var pageToken: String? = null
    private var shelfToken: String? = null
    private var loadingMore: Job? = null

    init { load() }

    fun load(refresh: Boolean = false) {
        viewModelScope.launch {
            if (refresh) refreshing = true else page = Load.Loading
            runCatching { fetch() }
                .onSuccess { p ->
                    page = Load.Ready(p)
                    more.clear()
                    moreItems.clear()
                    pageToken = p.continuation
                    shelfToken = p.sections.lastOrNull { it.layout == Layout.LIST }?.continuation
                }
                .onFailure { if (!refresh || page !is Load.Ready) page = Load.Failed(it.friendly()) }
            refreshing = false
        }
    }

    val canLoadMore: Boolean get() = pageToken != null || shelfToken != null

    /** Shelf continuation, for playing a long playlist past what's loaded. */
    val shelfContinuation: String? get() = shelfToken

    fun loadMore() {
        if (loadingMore?.isActive == true) return
        val shelf = shelfToken
        val pageNext = pageToken
        loadingMore = viewModelScope.launch {
            if (shelf != null) {
                val c = runCatching { YtMusic.browseMore(shelf) }.getOrNull()
                shelfToken = c?.continuation
                c?.items?.let { moreItems += it }
            } else if (pageNext != null) {
                val c = runCatching { YtMusic.browseMore(pageNext) }.getOrNull()
                pageToken = c?.continuation
                c?.sections?.let { more += it }
            }
        }
    }

    /** Every song of the page's lists, in order, for Play and Shuffle. */
    fun songs(): List<Song> {
        val p = (page as? Load.Ready)?.value ?: return emptyList()
        return (p.sections.filter { it.layout == Layout.LIST }.flatMap { it.items } + moreItems).filterIsInstance<Song>()
    }
}

class HomeModel : PageModel({ YtMusic.home(currentChip) }) {
    fun chip(params: String?) {
        currentChip = if (currentChip == params) null else params
        load()
    }

    companion object {
        // Read by the fetch lambda above; one Home at a time.
        private var currentChip: String? = null
    }
}

class BrowseModel(val browseId: String, val params: String?) : PageModel({ YtMusic.browse(browseId, params) })

class SearchModel(context: Context) : ViewModel() {
    private val prefs = context.applicationContext.getSharedPreferences("swar_search", Context.MODE_PRIVATE)

    var query by mutableStateOf("")
    var submitted by mutableStateOf("")
        private set
    var filter by mutableStateOf(SearchFilter.ALL)
        private set
    var suggestions by mutableStateOf<List<String>>(emptyList())
        private set
    var results by mutableStateOf<Load<Page>?>(null)
        private set
    val moreItems = mutableStateListOf<Item>()
    val recent = mutableStateListOf<String>().apply {
        addAll(prefs.getString("recent", "").orEmpty().split('\n').filter { it.isNotBlank() })
    }
    private var token: String? = null
    private var suggestJob: Job? = null
    private var moreJob: Job? = null

    fun type(text: String) {
        query = text
        suggestJob?.cancel()
        if (text.isBlank()) { suggestions = emptyList(); return }
        suggestJob = viewModelScope.launch {
            delay(220)
            suggestions = runCatching { YtMusic.suggestions(text) }.getOrDefault(emptyList()).take(8)
        }
    }

    fun submit(text: String = query, newFilter: SearchFilter = filter) {
        val q = text.trim()
        if (q.isEmpty()) return
        query = q
        submitted = q
        filter = newFilter
        suggestions = emptyList()
        rememberQuery(q)
        moreItems.clear()
        token = null
        viewModelScope.launch {
            results = Load.Loading
            runCatching { YtMusic.search(q, newFilter) }
                .onSuccess { p ->
                    results = Load.Ready(p)
                    token = if (newFilter == SearchFilter.ALL) null else p.sections.lastOrNull()?.continuation
                }
                .onFailure { results = Load.Failed(it.friendly()) }
        }
    }

    fun chooseFilter(f: SearchFilter) {
        if (submitted.isNotEmpty()) submit(submitted, f) else filter = f
    }

    val canLoadMore: Boolean get() = token != null

    fun loadMore() {
        val t = token ?: return
        if (moreJob?.isActive == true) return
        moreJob = viewModelScope.launch {
            val c = runCatching { YtMusic.searchMore(t) }.getOrNull()
            token = c?.continuation
            c?.items?.let { moreItems += it }
        }
    }

    fun clearResults() {
        submitted = ""
        results = null
        moreItems.clear()
    }

    private fun rememberQuery(q: String) {
        recent.remove(q)
        recent.add(0, q)
        while (recent.size > 12) recent.removeAt(recent.lastIndex)
        prefs.edit().putString("recent", recent.joinToString("\n")).apply()
    }

    fun forget(q: String) {
        recent.remove(q)
        prefs.edit().putString("recent", recent.joinToString("\n")).apply()
    }
}
