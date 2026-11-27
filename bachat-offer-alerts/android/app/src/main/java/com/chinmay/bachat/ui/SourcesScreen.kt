package com.chinmay.bachat.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.chinmay.bachat.core.Settings
import com.chinmay.bachat.data.Repo
import com.chinmay.bachat.data.SourceState

private val FACTS = listOf(
    "✅" to ("Public deal posts. " to "Offers people share for Zomato, Swiggy, Instamart, Blinkit, Zepto, BigBasket, Amazon, Flipkart, Myntra, PVR INOX, BookMyShow and more, with the price, MRP and discount read from each post."),
    "✅" to ("90%+ and price-error deals. " to "Spotted from the real price against the MRP, or words like “price error” and “pricing glitch”. They’re usually gone within minutes, so they get their own loud alert."),
    "➖" to ("Offers only inside your account. " to "Personal coupons in the Swiggy, Zomato or Blinkit apps depend on your login and address, and no open feed exists for them."),
    "➖" to ("Amazon and PVR offer pages. " to "They block automated reading, so Bachat relies on deal posts for them."),
)

@Composable
fun SourcesScreen(status: Map<String, SourceState>, settings: Settings, now: Long, padding: PaddingValues, onSave: (Settings) -> Unit) {
    var input by remember { mutableStateOf("") }
    var err by remember { mutableStateOf<String?>(null) }
    data class Row4(val id: String, val name: String, val note: String?, val own: String?)
    val rows = Repo.catalog.sources.filter { it.enabled }.map { Row4(it.id, it.name, it.note, null) } +
        settings.channels.map { Row4("tg:${it.lowercase()}", "@$it", "t.me/$it", it) }

    Column(
        Modifier.verticalScroll(rememberScrollState()).padding(start = 14.dp, end = 14.dp, top = padding.calculateTopPadding(), bottom = padding.calculateBottomPadding() + 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Card {
            H("Where offers come from")
            Sub("Read straight from your phone on every check. Bachat works out the store and the real discount from each post.")
            rows.forEach { r ->
                val s = status[r.id]
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(B.bg2).border(1.dp, B.line, RoundedCornerShape(14.dp)).padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(Modifier.size(10.dp).clip(CircleShape).background(if (s == null) B.muted else if (s.ok) B.mint else B.hot))
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(r.name, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        Text(
                            when {
                                s == null -> "Not checked yet"
                                !s.ok -> "Failing: ${s.error}"
                                else -> "${s.posts} posts · checked ${ago(s.checkedAt, now)}"
                            },
                            fontSize = 12.sp, color = B.muted,
                        )
                        if (r.own == null && r.note != null) Text(r.note, fontSize = 12.sp, color = B.muted)
                    }
                    if (r.own != null) Link("Remove") { onSave(settings.copy(channels = settings.channels - r.own)) }
                }
            }
            Text("Add a public Telegram deals channel", color = B.muted, fontSize = 13.sp)
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(input, { input = it }, Modifier.weight(1f), placeholder = { Text("t.me/channelname") }, singleLine = true)
                Spacer(Modifier.width(8.dp))
                Button(onClick = {
                    val ch = Settings.cleanChannel(input)
                    if (ch == null) err = "That doesn’t look like a public channel name (like lootdeals or t.me/lootdeals)."
                    else {
                        err = null
                        input = ""
                        onSave(settings.copy(channels = settings.channels + ch))
                    }
                }, shape = RoundedCornerShape(12.dp)) { Text("Add") }
            }
            err?.let { Text(it, color = B.hot, fontSize = 13.sp) }
        }
        Card {
            H("What Bachat can and can’t see")
            FACTS.forEach { (mark, t) ->
                Row {
                    Text(mark, modifier = Modifier.width(26.dp))
                    Text(t.first + t.second, fontSize = 13.sp, color = B.muted)
                }
            }
        }
    }
}
