package com.chinmay.bachat

import com.chinmay.bachat.core.Catalog
import com.chinmay.bachat.core.Deal
import com.chinmay.bachat.core.Deals
import com.chinmay.bachat.core.Discount
import com.chinmay.bachat.core.Feed
import com.chinmay.bachat.core.Json
import com.chinmay.bachat.core.Kind
import com.chinmay.bachat.core.Platforms
import com.chinmay.bachat.core.Quiet
import com.chinmay.bachat.core.Settings
import com.chinmay.bachat.core.Telegram
import com.chinmay.bachat.core.Tier
import com.chinmay.bachat.core.list
import com.chinmay.bachat.core.obj
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.time.Instant

/** Runs the shared fixtures (bachat-offer-alerts/shared) through the Kotlin port. */
class CoreTest {
    private fun shared(path: String): File {
        // Gradle runs unit tests from the module directory (android/app).
        val candidates = listOf("../../shared/$path", "../shared/$path", "shared/$path", "bachat-offer-alerts/shared/$path")
        return candidates.map(::File).firstOrNull { it.exists() } ?: error("shared/$path not found from ${File(".").absolutePath}")
    }

    private val catalog = Catalog(shared("data/platforms.json").readText(), shared("data/sources.json").readText())

    @Test
    fun sharedCasesMatchTheWebApp() {
        val cases = Json.parse(shared("fixtures/cases.json").readText()).obj()["cases"].list()
        assertTrue(cases.size >= 10)
        for (raw in cases) {
            val c = raw.obj()
            val text = c["text"] as String
            val links = c["links"].list().map { it as String }
            val d = Discount.extract(text)
            val label = text.lineSequence().first()
            assertEquals("percent: $label", (c["percent"] as Double?)?.toInt(), d.percent)
            assertEquals("kind: $label", c["kind"] as String?, d.kind?.json)
            assertEquals("upTo: $label", c["upTo"] as Boolean, d.upTo)
            assertEquals("priceError: $label", c["priceError"] as Boolean, d.priceError)
            assertEquals("platform: $label", c["platform"] as String, Platforms.detect(catalog, text, links))
            assertEquals("extraordinary: $label", c["extraordinary"] as Boolean, Discount.isExtraordinary(d))
        }
    }

    @Test
    fun discountEdgeCases() {
        assertNull(Discount.extract("100% cotton tee, 4.5 rating, battery 80% in 30 min").percent)
        val big = Discount.extract("₹1,49,999 ~~₹2,99,999~~")
        assertEquals(50, big.percent)
        assertEquals(149999.0, big.price!!, 0.0)
        assertEquals(70, Discount.extract("Extra 10% off. Now ₹300, MRP ₹1000").percent)
        assertEquals(90, Discount.extract("Worth ₹999 at ₹99 on orders above ₹199").percent)
        assertNull(Discount.extract("Free delivery on all orders today").percent)
    }

    @Test
    fun telegramPreview() {
        val posts = Telegram.parse(shared("fixtures/telegram-desidime.html").readText(), "desidime")
        assertEquals(listOf("205003", "205004", "205005", "205006", "205007"), posts.map { it.id })
        val p = posts.first { it.id == "205004" }
        assertEquals("https://t.me/desidime/205004", p.postUrl)
        assertEquals(Instant.parse("2026-11-27T04:40:05Z").toEpochMilli(), p.postedAt)
        assertEquals("https://cdn4.telesco.pe/file/zepto-cookware.jpg", p.image)
        assertEquals(listOf("https://ddime.in/zEp96"), p.links)
        assertTrue(p.text.contains("Cookware Set & more on Zepto"))
        assertTrue(p.text.contains("~~₹4,999~~"))

        val deal = Deals.toDeal(catalog, p, "tg:desidime", "DesiDime")
        assertEquals("zepto", deal.platform)
        assertEquals(96, deal.percent)
        assertEquals(Kind.PRICE, deal.d.kind)
        assertEquals("Wonderchef Stella Triply Cookware Set & more on Zepto", deal.title)
        assertEquals("https://ddime.in/zEp96", deal.url)
        val instamart = Deals.toDeal(catalog, posts.first { it.id == "205006" }, "tg:desidime", "DesiDime")
        assertEquals("instamart", instamart.platform)
        assertEquals(Kind.FREE, instamart.d.kind)
        assertTrue(Telegram.parse("<html>If you have Telegram, you can contact</html>", "nobody").isEmpty())
    }

    @Test
    fun redditFeed() {
        val items = Feed.parse(shared("fixtures/reddit-dealsforindia.xml").readText())
        assertEquals(2, items.size)
        assertEquals("t3_1abcde", items[0].id)
        assertEquals("https://blinkit.com/prn/cadbury-celebrations/prid/1234", items[0].links[0])
        val deal = Deals.toDeal(catalog, items[0], "rss:dealsforindia", "r/dealsforindia")
        assertEquals("blinkit", deal.platform)
        assertEquals(90, deal.percent)
        assertTrue(deal.d.priceError)
        assertFalse(deal.text.contains("submitted by"))
    }

    private val now = Instant.parse("2026-11-27T06:00:00Z").toEpochMilli()
    private fun deal(percent: Int? = 65, platform: String = "swiggy", text: String = "deal", posted: String = "2026-11-27T05:30:00Z", upTo: Boolean = false, priceError: Boolean = false): Deal {
        val base = Deals.toDeal(catalog, com.chinmay.bachat.core.RawPost("1", text, emptyList(), "u", Instant.parse(posted).toEpochMilli(), null), "x", "X")
        return base.copy(platform = platform, d = base.d.copy(percent = percent, kind = if (percent == null) null else Kind.PERCENT, upTo = upTo, priceError = priceError))
    }

    @Test
    fun matching() {
        val s = Settings()
        assertTrue(Deals.match(deal(), s, now, 12).notify)
        assertEquals("40% is under your 60%", Deals.match(deal(40), s, now, 12).reason)
        assertFalse(Deals.match(deal(), s.copy(platforms = mapOf("swiggy" to false)), now, 12).notify)

        val strict = s.copy(minDiscount = 95, platforms = mapOf("swiggy" to false), quiet = Quiet(true, 23, 7))
        assertEquals(Tier.EXTRAORDINARY, Deals.match(deal(92), strict, now, 2).tier)
        assertTrue(Deals.match(deal(null, priceError = true), strict, now, 2).notify)
        assertEquals(Tier.NORMAL, Deals.match(deal(90, upTo = true), s, now, 12).tier)

        val old = deal(posted = "2026-11-26T20:00:00Z")
        assertFalse(Deals.match(old, s, now, 12).notify)
        assertTrue(Deals.match(old, s.copy(agesEarlier = true), now, 12).notify)

        val quiet = s.copy(quiet = Quiet(true, 23, 7))
        assertEquals("quiet hours", Deals.match(deal(), quiet, now, 1).reason)
        assertTrue(Deals.match(deal(), quiet, now, 8).notify)

        assertFalse(Deals.match(deal(text = "Biryani deal"), s.copy(keywords = listOf("pizza")), now, 12).notify)
        assertFalse(Deals.match(deal(99, text = "Credit card offer"), s.copy(muted = listOf("credit card")), now, 12).notify)
        assertFalse(Deals.match(deal(null), s, now, 12).notify)
        assertTrue(Deals.match(deal(null), s.copy(includeNoDiscount = true), now, 12).notify)
    }

    @Test
    fun titles() {
        val grabon = "🔥 Time to elevate your style!\nALCIS Men Regular Fit Running Tracksuit Deal 🔥😍\n💥 54% OFF\n💰 Now just ₹1,610 (MRP ₹3,499)\n👉 https://grbn.in/XciE6x"
        assertEquals("ALCIS Men Regular Fit Running Tracksuit Deal", Deals.titleOf(grabon, catalog))
        assertEquals(54, Discount.extract(grabon).percent)
        assertEquals("Biryani BOGO on Zomato!", Deals.titleOf("Biryani BOGO on Zomato!\nUse code EAT", catalog))
        assertEquals("Grab it fast!", Deals.titleOf("Grab it fast!", catalog))
        assertEquals("Wonderchef set", Deals.titleOf("📉 96% Off\n\nWonderchef set", catalog))
    }

    @Test
    fun notificationText() {
        val d = deal(96, platform = "zepto").let { it.copy(title = "Cookware", d = it.d.copy(price = 200.0, mrp = 4999.0)) }
        assertEquals("🚨 96% off · Zepto" to "Cookware · ₹200 (MRP ₹4999)", Deals.notification(catalog, d, Tier.EXTRAORDINARY))
    }

    @Test
    fun settingsRoundTrip() {
        val s = Settings.from(Json.parse("""{"minDiscount":400,"keywords":[" Pizza ","pizza",3],"channels":["@lootdeals","https://t.me/s/Abcd_1","x"]}"""))
        assertEquals(95, s.minDiscount)
        assertEquals(listOf("pizza"), s.keywords)
        assertEquals(listOf("lootdeals", "Abcd_1"), s.channels)
        assertTrue(s.platformOn("zomato"))
        assertFalse(s.platformOn("other"))
        assertEquals(s, Settings.from(Json.parse(Json.write(s.toMap()))))
        val d = deal(96)
        assertEquals(d, Deal.from(Json.parse(Json.write(d.toMap())).obj()))
    }
}
