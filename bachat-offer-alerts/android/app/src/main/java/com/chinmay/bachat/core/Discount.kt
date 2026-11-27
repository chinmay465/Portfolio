package com.chinmay.bachat.core

import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToLong

// Port of shared/discount.ts. Both are checked against shared/fixtures/cases.json.
object Discount {
    private val MRP_WORDS = Regex("""(?:m\.?r\.?p\.?|original price|list price|regular price|actual price|retail price|worth|value of|was|normally|usually|market price)\s*(?:of|is|:|-|=)?\s*(?:rs\.?|inr|₹)?\s*$""")
    private val MIN_ORDER_WORDS = Regex("""(?:above|over|min(?:imum)?(?:\s*order)?(?:\s*value)?|orders?\s*of|on\s*orders?|spend(?:ing)?|purchase\s*of|on\s*min|cart\s*value|on)\s*(?:of|:)?\s*(?:rs\.?|inr|₹)?\s*$""")
    private val OFF_AFTER = Regex("""^\s*(?:/-)?\s*(?:off|discount|cashback|cash back|instant discount|savings?)\b""")
    private val PRICE_ERROR = Regex("""\b(?:price|pricing|mrp)\s*(?:error|glitch|mistake|bug)\b|\bglitch\s*deal\b|\bbug\s*deal\b""")
    private val LOOT = Regex("""\bloot\b""")
    private val FREE = Regex("""\b(?:free of cost|for free|absolutely free|totally free|100% free|freebie|free sample|@\s*free|at\s*free|get it free)\b""")
    private val PERCENT_OK_AFTER = Regex("""^\s*(?:off|discount|cashback|cash back|instant|less|lower|price drop|drop|down|savings?)\b""")
    private val PERCENT_OK_BEFORE = Regex("""(?:up\s*to|upto|flat|extra|save|saving|additional|@|\bat|-|get|min(?:imum)?)\s*$""")
    private val UPTO_BEFORE = Regex("""(?:up\s*to|upto|till|max(?:imum)?)\s*$""")
    private val NOT_DISCOUNT_AFTER = Regex("""^\s*(?:cotton|pure|genuine|natural|original|organic|polyester|silk|wool|guarantee|positive|rating|battery|charged)""")
    private val PERCENT = Regex("""(\d{1,3}(?:\.\d+)?)\s*%""")
    private val AMOUNT = Regex("""₹\s*(\d+(?:\.\d+)?)(?:\s*/-)?""")
    private val ARROW = Regex("""₹\s*(\d+(?:\.\d+)?)\s*(?:→|->|➡️?|➜|⟶|⇒|=>)\s*₹\s*(\d+(?:\.\d+)?)""")
    private val FROM_TO = Regex("""from\s*₹\s*(\d+(?:\.\d+)?)\s*to\s*₹\s*(\d+(?:\.\d+)?)""")
    private val INSTEAD = Regex("""₹\s*(\d+(?:\.\d+)?)\s*(?:instead of|in place of|vs\.?)\s*₹\s*(\d+(?:\.\d+)?)""")
    private val FLAT = Regex("""₹\s*(\d+)\s*(?:/-)?\s*(?:flat\s*)?(?:off|discount|cashback)\s*(?:on|above|over)?\s*(?:min(?:imum)?\s*)?(?:orders?|cart|spend|purchase)?\s*(?:value\s*)?(?:of|above|over|:)?\s*₹\s*(\d+)""")
    private val BUY_GET = Regex("""\bbuy\s*(\d)\s*get\s*(\d)\b""")
    private val BOGO = Regex("""\b(?:b1g1|bogo|1\s*\+\s*1\s*free)\b""")
    private val AT_BEFORE = Regex("""(?:@|at|for|just|only|price)\s*$""")
    private val RUPEE_WORD = Regex("""\b(?:rs|inr)\.?\s*(?=\d)""")
    private val THOUSANDS = Regex("""(\d),(?=\d{2,3}\b)""")

    fun normalize(text: String): String {
        var t = text.lowercase()
        t = RUPEE_WORD.replace(t, "₹")
        t = THOUSANDS.replace(t, "$1")
        t = THOUSANDS.replace(t, "$1")
        return t
    }

    private class Amount(val value: Double, val start: Int, val mrp: Boolean, val minOrder: Boolean, val off: Boolean)
    private class Cand(val value: Int, val kind: Kind, val rank: Int)

    private fun round(x: Double) = x.roundToLong().toInt()
    private fun pct(price: Double, mrp: Double) = round((1 - price / mrp) * 100)
    private fun before(t: String, at: Int, n: Int) = t.substring(max(0, at - n), at)
    private fun after(t: String, at: Int, n: Int) = t.substring(at, min(t.length, at + n))

    private fun amounts(t: String): List<Amount> = AMOUNT.findAll(t).map { m ->
        val start = m.range.first
        val end = m.range.last + 1
        val b = before(t, start, 28)
        val a = after(t, end, 24)
        val struck = Regex("""~~\s*$""").containsMatchIn(b) && Regex("""^\s*~~""").containsMatchIn(a)
        val mrp = MRP_WORDS.containsMatchIn(b)
        Amount(m.groupValues[1].toDouble(), start, struck || mrp, MIN_ORDER_WORDS.containsMatchIn(b) && !mrp, OFF_AFTER.containsMatchIn(a))
    }.toList()

    fun extract(text: String): DiscountInfo {
        val t = normalize(text)
        val exact = ArrayList<Cand>()
        var upToBest: Int? = null
        var price: Double? = null
        var mrp: Double? = null

        for (m in PERCENT.findAll(t)) {
            val value = m.groupValues[1].toDouble()
            if (!(value > 0 && value <= 100)) continue
            val start = m.range.first
            val end = m.range.last + 1
            val b = before(t, start, 12)
            val a = after(t, end, 18)
            if (!PERCENT_OK_AFTER.containsMatchIn(a) && !PERCENT_OK_BEFORE.containsMatchIn(b)) continue
            if (NOT_DISCOUNT_AFTER.containsMatchIn(a)) continue
            if (UPTO_BEFORE.containsMatchIn(b)) upToBest = max(upToBest ?: 0, round(value))
            else exact.add(Cand(round(value), Kind.PERCENT, 2))
        }

        val list = amounts(t)
        val mrpAmt = list.firstOrNull { it.mrp }
        val priced = list.filter { !it.mrp && !it.minOrder && !it.off }
        if (mrpAmt != null) {
            val cands = priced.filter { it.value < mrpAmt.value }
            if (cands.isNotEmpty()) {
                val p = cands.minOf { it.value }
                price = p
                mrp = mrpAmt.value
                exact.add(Cand(pct(p, mrpAmt.value), if (p <= 1) Kind.FREE else Kind.PRICE, 3))
            }
        } else {
            val arrow = ARROW.find(t) ?: FROM_TO.find(t)
            val instead = INSTEAD.find(t)
            var hi: Double? = null
            var lo: Double? = null
            if (arrow != null) {
                hi = arrow.groupValues[1].toDouble(); lo = arrow.groupValues[2].toDouble()
            } else if (instead != null) {
                lo = instead.groupValues[1].toDouble(); hi = instead.groupValues[2].toDouble()
            }
            if (hi != null && lo != null && lo < hi) {
                price = lo
                mrp = hi
                exact.add(Cand(pct(lo, hi), if (lo <= 1) Kind.FREE else Kind.PRICE, 3))
            }
        }

        for (m in FLAT.findAll(t)) {
            val off = m.groupValues[1].toDouble()
            val minOrder = m.groupValues[2].toDouble()
            if (minOrder > 0 && off > 0 && off <= minOrder) exact.add(Cand(round(off / minOrder * 100), Kind.FLAT, 1))
        }

        val bg = BUY_GET.find(t)?.let { it.groupValues[1].toInt() to it.groupValues[2].toInt() }
            ?: if (BOGO.containsMatchIn(t)) 1 to 1 else null
        if (bg != null && bg.first > 0 && bg.second > 0) {
            exact.add(Cand(round(bg.second.toDouble() / (bg.first + bg.second) * 100), Kind.BOGO, 1))
        }

        if (exact.none { it.kind == Kind.PRICE || it.kind == Kind.FREE }) {
            val atOne = priced.firstOrNull { it.value <= 1 && AT_BEFORE.containsMatchIn(before(t, it.start, 8)) }
            if (FREE.containsMatchIn(t) || atOne != null) {
                exact.add(Cand(100, Kind.FREE, 0))
                if (atOne != null) price = atOne.value
            }
        }

        val priceError = PRICE_ERROR.containsMatchIn(t)
        val loot = LOOT.containsMatchIn(t)

        if (exact.isNotEmpty()) {
            val priceBased = exact.filter { it.rank == 3 }
            val pool = priceBased.ifEmpty { exact }
            var pick = pool[0]
            for (c in pool) if (c.value > pick.value) pick = c
            return DiscountInfo(pick.value.coerceIn(0, 100), pick.kind, false, price, mrp, priceError, loot)
        }
        if (upToBest != null) return DiscountInfo(upToBest, Kind.PERCENT, true, price, mrp, priceError, loot)
        return DiscountInfo(null, null, false, price, mrp, priceError, loot)
    }

    /** 90%+ off for real (not "up to"), or a price error. */
    fun isExtraordinary(d: DiscountInfo, threshold: Int = 90): Boolean =
        (d.percent != null && !d.upTo && d.percent >= threshold) || d.priceError
}
