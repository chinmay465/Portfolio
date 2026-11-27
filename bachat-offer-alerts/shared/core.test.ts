import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { matchDeal, notificationFor, titleOf, toDeal } from './deal.ts'
import { extractDiscount, isExtraordinary } from './discount.ts'
import { parseFeed } from './parse/rss.ts'
import { parseTelegram } from './parse/telegram.ts'
import { detectPlatform } from './platforms.ts'
import { DEFAULT_SETTINGS, cleanChannel, normalizeSettings } from './types.ts'
import type { Deal, Settings } from './types.ts'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures')
const fixture = (name: string) => fs.readFileSync(path.join(dir, name), 'utf8')

interface Case {
  text: string
  links?: string[]
  percent: number | null
  kind: string | null
  upTo: boolean
  priceError: boolean
  platform: string
  extraordinary: boolean
}
const { cases } = JSON.parse(fixture('cases.json')) as { cases: Case[] }

describe('shared cases (the Android tests read the same file)', () => {
  for (const c of cases) {
    it(c.text.split('\n')[0].slice(0, 60), () => {
      const d = extractDiscount(c.text)
      expect({ percent: d.percent, kind: d.kind, upTo: d.upTo, priceError: d.priceError }).toEqual({
        percent: c.percent,
        kind: c.kind,
        upTo: c.upTo,
        priceError: c.priceError,
      })
      expect(detectPlatform(c.text, c.links ?? [])).toBe(c.platform)
      expect(isExtraordinary(d)).toBe(c.extraordinary)
    })
  }
})

describe('discount edge cases', () => {
  it('ignores percentages that are not discounts', () => {
    expect(extractDiscount('100% cotton tee, 4.5 rating, battery 80% in 30 min').percent).toBeNull()
  })
  it('reads Indian thousands separators', () => {
    expect(extractDiscount('₹1,49,999 ~~₹2,99,999~~')).toMatchObject({ percent: 50, price: 149999, mrp: 299999 })
  })
  it('prefers what you pay over a smaller stated percentage', () => {
    expect(extractDiscount('Extra 10% off. Now ₹300, MRP ₹1000').percent).toBe(70)
  })
  it('ignores the order minimum when reading the price', () => {
    expect(extractDiscount('Worth ₹999 at ₹99 on orders above ₹199')).toMatchObject({ percent: 90, price: 99 })
  })
  it('does not take "free delivery" as a free deal', () => {
    expect(extractDiscount('Free delivery on all orders today').percent).toBeNull()
  })
})

describe('Telegram channel preview', () => {
  const posts = parseTelegram(fixture('telegram-desidime.html'), 'desidime')
  it('reads text posts and skips stickers', () => {
    expect(posts.map((p) => p.id)).toEqual(['205003', '205004', '205005', '205006', '205007'])
  })
  it('keeps the post link, time, photo and store link', () => {
    const p = posts.find((x) => x.id === '205004')!
    expect(p.postUrl).toBe('https://t.me/desidime/205004')
    expect(p.postedAt).toBe('2026-11-27T04:40:05.000Z')
    expect(p.image).toBe('https://cdn4.telesco.pe/file/zepto-cookware.jpg')
    expect(p.links).toEqual(['https://ddime.in/zEp96'])
    expect(p.text).toContain('Cookware Set & more on Zepto')
    expect(p.text).toContain('~~₹4,999~~')
  })
  it('turns posts into deals with store and discount', () => {
    const deals = posts.map((p) => toDeal(p, { id: 'tg:desidime', name: 'DesiDime' }))
    const byId = Object.fromEntries(deals.map((d) => [d.id.split(':').pop(), d]))
    expect(byId['205004']).toMatchObject({ platform: 'zepto', percent: 96, kind: 'price', price: 200, mrp: 4999, url: 'https://ddime.in/zEp96' })
    expect(byId['205004'].title).toBe('Wonderchef Stella Triply Cookware Set & more on Zepto')
    expect(byId['205005']).toMatchObject({ platform: 'flipkart', percent: 58 })
    expect(byId['205006']).toMatchObject({ platform: 'instamart', percent: 100, kind: 'free' })
    expect(byId['205007']).toMatchObject({ platform: 'amazon', percent: 23 })
  })
  it('returns nothing for a page that is not a channel preview', () => {
    expect(parseTelegram('<html><body>If you have Telegram, you can contact</body></html>', 'nobody')).toEqual([])
  })
})

describe('RSS / Atom feed', () => {
  const items = parseFeed(fixture('reddit-dealsforindia.xml'))
  it('reads Reddit entries with their store link', () => {
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ id: 't3_1abcde', postedAt: '2026-11-27T05:10:00.000Z', image: 'https://b.thumbs.redditmedia.com/cadbury.jpg' })
    expect(items[0].links[0]).toBe('https://blinkit.com/prn/cadbury-celebrations/prid/1234')
    const deal = toDeal(items[0], { id: 'rss:dealsforindia', name: 'r/dealsforindia' })
    expect(deal).toMatchObject({ platform: 'blinkit', percent: 90, priceError: true, url: 'https://blinkit.com/prn/cadbury-celebrations/prid/1234' })
    expect(deal.text).not.toContain('submitted by')
  })
})

describe('alert matching', () => {
  const now = Date.parse('2026-11-27T06:00:00Z')
  const base = (over: Partial<Deal>): Deal => ({
    id: 'x:1', source: 'x', sourceName: 'X', title: 't', text: 'deal', url: 'u', postUrl: 'u',
    postedAt: '2026-11-27T05:30:00Z', platform: 'swiggy', percent: 65, kind: 'percent', upTo: false,
    priceError: false, loot: false, ...over,
  })
  const s = (over: Partial<Settings> = {}) => normalizeSettings({ ...DEFAULT_SETTINGS, ...over })

  it('notifies at or above the minimum discount', () => {
    expect(matchDeal(base({}), s(), now, 12)).toMatchObject({ notify: true, tier: 'normal' })
    expect(matchDeal(base({ percent: 40 }), s(), now, 12)).toMatchObject({ notify: false, reason: '40% is under your 60%' })
  })
  it('respects store switches', () => {
    const off = s({ platforms: { ...DEFAULT_SETTINGS.platforms, swiggy: false } })
    expect(matchDeal(base({}), off, now, 12).notify).toBe(false)
  })
  it('sends extraordinary deals for any store, even in quiet hours', () => {
    const strict = s({ minDiscount: 95, platforms: { ...DEFAULT_SETTINGS.platforms, swiggy: false }, quiet: { enabled: true, from: 23, to: 7 } })
    expect(matchDeal(base({ percent: 92 }), strict, now, 2)).toMatchObject({ notify: true, tier: 'extraordinary' })
    expect(matchDeal(base({ percent: null, priceError: true }), strict, now, 2)).toMatchObject({ notify: true, tier: 'extraordinary' })
  })
  it('does not treat "up to 90%" as extraordinary', () => {
    expect(matchDeal(base({ percent: 90, upTo: true }), s(), now, 12).tier).toBe('normal')
    expect(matchDeal(base({ percent: 90, upTo: true }), s({ includeUpTo: false }), now, 12).notify).toBe(false)
  })
  it('splits offers into now and earlier', () => {
    const old = base({ postedAt: '2026-11-26T20:00:00Z' })
    expect(matchDeal(old, s(), now, 12)).toMatchObject({ notify: false, reason: 'posted more than 3 h ago' })
    expect(matchDeal(old, s({ ages: { now: true, earlier: true } }), now, 12).notify).toBe(true)
    expect(matchDeal(base({}), s({ ages: { now: false, earlier: true } }), now, 12).notify).toBe(false)
  })
  it('holds normal alerts in quiet hours but still counts them as matches', () => {
    const quiet = s({ quiet: { enabled: true, from: 23, to: 7 } })
    expect(matchDeal(base({}), quiet, now, 1)).toMatchObject({ notify: false, matches: true, reason: 'quiet hours' })
    expect(matchDeal(base({}), quiet, now, 8).notify).toBe(true)
  })
  it('applies keywords and muted words', () => {
    expect(matchDeal(base({ text: 'Biryani deal' }), s({ keywords: ['pizza'] }), now, 12).notify).toBe(false)
    expect(matchDeal(base({ text: 'Pizza deal' }), s({ keywords: ['pizza'] }), now, 12).notify).toBe(true)
    expect(matchDeal(base({ text: 'Credit card offer', percent: 99 }), s({ muted: ['credit card'] }), now, 12).notify).toBe(false)
  })
  it('skips offers with no discount unless asked', () => {
    expect(matchDeal(base({ percent: null, kind: null }), s(), now, 12).notify).toBe(false)
    expect(matchDeal(base({ percent: null, kind: null }), s({ includeNoDiscount: true }), now, 12).notify).toBe(true)
  })
  it('writes notification text', () => {
    expect(notificationFor(base({ percent: 96, platform: 'zepto', title: 'Cookware', price: 200, mrp: 4999 }), 'extraordinary')).toEqual({
      title: '🚨 96% off · Zepto',
      body: 'Cookware · ₹200 (MRP ₹4999)',
    })
  })
})

describe('settings', () => {
  it('fills defaults and clamps', () => {
    const n = normalizeSettings({ minDiscount: 400, keywords: [' Pizza ', 'pizza', 3], channels: ['@lootdeals', 'https://t.me/s/Abcd_1', 'x'] })
    expect(n.minDiscount).toBe(95)
    expect(n.keywords).toEqual(['pizza'])
    expect(n.channels).toEqual(['lootdeals', 'Abcd_1'])
    expect(n.platforms.zomato).toBe(true)
    expect(n.platforms.other).toBe(false)
  })
  it('reads channel names', () => {
    expect(cleanChannel('t.me/desidime')).toBe('desidime')
    expect(cleanChannel('bad name')).toBeNull()
  })
  it('titles skip emoji and links', () => {
    expect(titleOf('🔥🔥\nhttps://x.y\nBig sale')).toBe('Big sale')
    expect(titleOf('📉 96% Off\n\nWonderchef set')).toBe('Wonderchef set')
    expect(titleOf('[Blinkit] Cadbury at ₹49')).toBe('[Blinkit] Cadbury at ₹49')
    expect(titleOf('70% off')).toBe('70% off')
    // GrabOn's layout: slogan, product, discount, price, link.
    const grabon = '🔥 Time to elevate your style!\nALCIS Men Regular Fit Running Tracksuit Deal 🔥😍\n💥 54% OFF\n💰 Now just ₹1,610 (MRP ₹3,499)\n👉 https://grbn.in/XciE6x'
    expect(titleOf(grabon)).toBe('ALCIS Men Regular Fit Running Tracksuit Deal')
    expect(extractDiscount(grabon)).toMatchObject({ percent: 54, kind: 'price', price: 1610, mrp: 3499 })
    expect(titleOf('Biryani BOGO on Zomato!\nUse code EAT')).toBe('Biryani BOGO on Zomato!')
    expect(titleOf('Grab it fast!')).toBe('Grab it fast!')
  })
})
