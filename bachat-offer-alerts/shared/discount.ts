import type { DiscountInfo, DiscountKind } from './types.ts'

// Keep in step with android/app/src/main/java/com/chinmay/bachat/core/Discount.kt.
// Both are checked against shared/fixtures/cases.json.

const MRP_WORDS = /(?:m\.?r\.?p\.?|original price|list price|regular price|actual price|retail price|worth|value of|was|normally|usually|market price)\s*(?:of|is|:|-|=)?\s*(?:rs\.?|inr|₹)?\s*$/
const MIN_ORDER_WORDS = /(?:above|over|min(?:imum)?(?:\s*order)?(?:\s*value)?|orders?\s*of|on\s*orders?|spend(?:ing)?|purchase\s*of|on\s*min|cart\s*value|on)\s*(?:of|:)?\s*(?:rs\.?|inr|₹)?\s*$/
const OFF_AFTER = /^\s*(?:\/-)?\s*(?:off|discount|cashback|cash back|instant discount|savings?)\b/
const PRICE_ERROR = /\b(?:price|pricing|mrp)\s*(?:error|glitch|mistake|bug)\b|\bglitch\s*deal\b|\bbug\s*deal\b/
const LOOT = /\bloot\b/
const FREE = /\b(?:free of cost|for free|absolutely free|totally free|100% free|freebie|free sample|@\s*free|at\s*free|get it free)\b/
const PERCENT_OK_AFTER = /^\s*(?:off|discount|cashback|cash back|instant|less|lower|price drop|drop|down|savings?)\b/
const PERCENT_OK_BEFORE = /(?:up\s*to|upto|flat|extra|save|saving|additional|@|\bat|-|get|min(?:imum)?)\s*$/
const UPTO_BEFORE = /(?:up\s*to|upto|till|max(?:imum)?)\s*$/

/** Lower-cased text with rupee spellings unified to ₹ and thousands separators removed. */
export function normalizeForDiscount(text: string): string {
  let t = text.toLowerCase()
  t = t.replace(/\b(?:rs|inr)\.?\s*(?=\d)/g, '₹')
  t = t.replace(/(\d),(?=\d{2,3}\b)/g, '$1')
  t = t.replace(/(\d),(?=\d{2,3}\b)/g, '$1')
  return t
}

interface Amount {
  value: number
  start: number
  end: number
  mrp: boolean
  minOrder: boolean
  off: boolean
}

function amounts(t: string): Amount[] {
  const out: Amount[] = []
  const re = /₹\s*(\d+(?:\.\d+)?)(?:\s*\/-)?/g
  for (const m of t.matchAll(re)) {
    const start = m.index ?? 0
    const end = start + m[0].length
    const before = t.slice(Math.max(0, start - 28), start)
    const after = t.slice(end, end + 24)
    const struck = /~~\s*$/.test(before) && /^\s*~~/.test(after)
    out.push({
      value: Number(m[1]),
      start,
      end,
      mrp: struck || MRP_WORDS.test(before),
      minOrder: MIN_ORDER_WORDS.test(before) && !MRP_WORDS.test(before),
      off: OFF_AFTER.test(after),
    })
  }
  return out
}

const pct = (price: number, mrp: number) => Math.round((1 - price / mrp) * 100)

/** Works out the discount a deal post claims. */
export function extractDiscount(text: string): DiscountInfo {
  const t = normalizeForDiscount(text)
  const exact: { value: number; kind: DiscountKind; rank: number }[] = []
  let upToBest: number | null = null
  let price: number | undefined
  let mrp: number | undefined

  // 1. "96% off", "flat 60%", "up to 80% off", "-75%"
  for (const m of t.matchAll(/(\d{1,3}(?:\.\d+)?)\s*%/g)) {
    const value = Number(m[1])
    if (!(value > 0 && value <= 100)) continue
    const start = m.index ?? 0
    const before = t.slice(Math.max(0, start - 12), start)
    const after = t.slice(start + m[0].length, start + m[0].length + 18)
    if (!PERCENT_OK_AFTER.test(after) && !PERCENT_OK_BEFORE.test(before)) continue
    if (/^\s*(?:cotton|pure|genuine|natural|original|organic|polyester|silk|wool|guarantee|positive|rating|battery|charged)/.test(after)) continue
    if (UPTO_BEFORE.test(before)) upToBest = Math.max(upToBest ?? 0, Math.round(value))
    else exact.push({ value: Math.round(value), kind: 'percent', rank: 2 })
  }

  const list = amounts(t)

  // 2. Price against MRP: "₹200 (MRP ₹4999)", "₹200 ~~₹4999~~", "worth ₹500 for ₹1"
  const mrpAmt = list.find((a) => a.mrp)
  const priced = list.filter((a) => !a.mrp && !a.minOrder && !a.off)
  if (mrpAmt) {
    const cands = priced.filter((a) => a.value < mrpAmt.value)
    if (cands.length) {
      price = Math.min(...cands.map((a) => a.value))
      mrp = mrpAmt.value
      exact.push({ value: pct(price, mrp), kind: price <= 1 ? 'free' : 'price', rank: 3 })
    }
  } else {
    // "₹999 → ₹99", "from ₹999 to ₹99", "₹99 instead of ₹999"
    const arrow = t.match(/₹\s*(\d+(?:\.\d+)?)\s*(?:→|->|➡️?|➜|⟶|⇒|=>)\s*₹\s*(\d+(?:\.\d+)?)/) ??
      t.match(/from\s*₹\s*(\d+(?:\.\d+)?)\s*to\s*₹\s*(\d+(?:\.\d+)?)/)
    const instead = t.match(/₹\s*(\d+(?:\.\d+)?)\s*(?:instead of|in place of|vs\.?)\s*₹\s*(\d+(?:\.\d+)?)/)
    let hi: number | undefined
    let lo: number | undefined
    if (arrow) [hi, lo] = [Number(arrow[1]), Number(arrow[2])]
    else if (instead) [lo, hi] = [Number(instead[1]), Number(instead[2])]
    if (hi !== undefined && lo !== undefined && lo < hi) {
      price = lo
      mrp = hi
      exact.push({ value: pct(lo, hi), kind: lo <= 1 ? 'free' : 'price', rank: 3 })
    }
  }

  // 3. Flat amount off a minimum order: "₹150 off on orders above ₹199"
  for (const m of t.matchAll(/₹\s*(\d+)\s*(?:\/-)?\s*(?:flat\s*)?(?:off|discount|cashback)\s*(?:on|above|over)?\s*(?:min(?:imum)?\s*)?(?:orders?|cart|spend|purchase)?\s*(?:value\s*)?(?:of|above|over|:)?\s*₹\s*(\d+)/g)) {
    const off = Number(m[1])
    const min = Number(m[2])
    if (min > 0 && off > 0 && off <= min) exact.push({ value: Math.round((off / min) * 100), kind: 'flat', rank: 1 })
  }

  // 4. Buy X get Y
  const bogo = t.match(/\bbuy\s*(\d)\s*get\s*(\d)\b/) ?? (/\b(?:b1g1|bogo|1\s*\+\s*1\s*free)\b/.test(t) ? ['', '1', '1'] : null)
  if (bogo) {
    const buy = Number(bogo[1])
    const get = Number(bogo[2])
    if (buy > 0 && get > 0) exact.push({ value: Math.round((get / (buy + get)) * 100), kind: 'bogo', rank: 1 })
  }

  // 5. Free or ₹1 with nothing to compare against
  if (!exact.some((e) => e.kind === 'price' || e.kind === 'free')) {
    const dealAtOne = priced.some((a) => a.value <= 1 && /(?:@|at|for|just|only|price)\s*$/.test(t.slice(Math.max(0, a.start - 8), a.start)))
    if (FREE.test(t) || dealAtOne) {
      exact.push({ value: 100, kind: 'free', rank: 0 })
      if (dealAtOne) price = priced.find((a) => a.value <= 1)?.value
    }
  }

  const priceError = PRICE_ERROR.test(t)
  const loot = LOOT.test(t)

  if (exact.length) {
    // Prices beat stated percentages (they're what you pay); otherwise the biggest claim wins.
    const priceBased = exact.filter((e) => e.rank === 3)
    const pick = (priceBased.length ? priceBased : exact).reduce((a, b) => (b.value > a.value ? b : a))
    return { percent: Math.max(0, Math.min(100, pick.value)), kind: pick.kind, upTo: false, price, mrp, priceError, loot }
  }
  if (upToBest !== null) return { percent: upToBest, kind: 'percent', upTo: true, price, mrp, priceError, loot }
  return { percent: null, kind: null, upTo: false, price, mrp, priceError, loot }
}

/** 90%+ off for real (not "up to"), or a price error. */
export function isExtraordinary(d: Pick<DiscountInfo, 'percent' | 'upTo' | 'priceError'>, threshold = 90): boolean {
  return (d.percent !== null && !d.upTo && d.percent >= threshold) || d.priceError
}
