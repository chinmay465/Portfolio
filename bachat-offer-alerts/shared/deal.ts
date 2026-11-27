import { extractDiscount, isExtraordinary } from './discount.ts'
import { detectPlatform } from './platforms.ts'
import type { RawPost } from './parse/telegram.ts'
import { platformById } from './types.ts'
import type { Deal, Settings } from './types.ts'

const NOT_STORE = /^https?:\/\/(?:[a-z0-9-]+\.)*(?:t\.me|telegram\.(?:me|org)|telesco\.pe|reddit\.com|redd\.it|whatsapp\.com|wa\.me|instagram\.com|youtube\.com|youtu\.be|x\.com|twitter\.com)(?:[/?#]|$)/i

/** Lines that only restate the discount ("96% Off", "Flat 50% off") make poor titles. */
export const ONLY_DISCOUNT = /^(?:flat|upto|up to|extra|get)?\s*\d{1,3}\s*%\s*(?:off|discount|cashback)?\s*[!.]*$/i

/** First line with letters that says more than the discount, without leading emoji, at most 120 characters. */
export function titleOf(text: string): string {
  let fallback = ''
  for (const raw of text.split('\n')) {
    const line = raw.replace(/~~/g, '').replace(/^[^\p{L}\p{N}₹[(]+/u, '').trim()
    if (!/\p{L}/u.test(line) || /^https?:\/\//i.test(line)) continue
    if (ONLY_DISCOUNT.test(line)) {
      fallback ||= line
      continue
    }
    return line.length > 120 ? line.slice(0, 117).trimEnd() + '…' : line
  }
  return fallback || text.slice(0, 120)
}

export function toDeal(post: RawPost, source: { id: string; name: string }): Deal {
  const discount = extractDiscount(post.text)
  const store = post.links.find((l) => !NOT_STORE.test(l))
  return {
    id: `${source.id}:${post.id}`,
    source: source.id,
    sourceName: source.name,
    title: titleOf(post.text),
    text: post.text.length > 700 ? post.text.slice(0, 697) + '…' : post.text,
    url: store ?? post.postUrl,
    postUrl: post.postUrl,
    image: post.image,
    postedAt: post.postedAt,
    platform: detectPlatform(post.text, post.links),
    ...discount,
  }
}

export type Tier = 'extraordinary' | 'normal'

export interface MatchResult {
  /** Notify now. */
  notify: boolean
  /** Fits the settings, whether or not quiet hours hold the alert back. */
  matches: boolean
  tier: Tier | null
  /** Why not, for the feed's "why didn't I get this?" hint. */
  reason: string
}

const contains = (text: string, words: string[]) => {
  const t = text.toLowerCase()
  return words.find((w) => t.includes(w))
}

export function isNow(deal: Pick<Deal, 'postedAt'>, nowHours: number, now = Date.now()): boolean {
  return now - Date.parse(deal.postedAt) <= nowHours * 3_600_000
}

function inQuietHours(q: Settings['quiet'], localHour: number): boolean {
  if (!q.enabled || q.from === q.to) return false
  return q.from < q.to ? localHour >= q.from && localHour < q.to : localHour >= q.from || localHour < q.to
}

/**
 * Does this deal fit the alert settings? `localHour` is the subscriber's hour of day (0–23),
 * for quiet hours. Extraordinary deals skip the discount, platform (when anyPlatform is on),
 * keyword and quiet-hour rules; muted words and offer age still apply to them.
 */
export function matchDeal(deal: Deal, s: Settings, now = Date.now(), localHour = new Date(now).getHours()): MatchResult {
  const no = (reason: string): MatchResult => ({ notify: false, matches: false, tier: null, reason })
  const muted = contains(deal.text, s.muted)
  if (muted) return no(`mentions “${muted}”, which you muted`)

  const fresh = isNow(deal, s.nowHours, now)
  if (fresh && !s.ages.now) return no('offers posted now are switched off')
  if (!fresh && !s.ages.earlier) return no(`posted more than ${s.nowHours} h ago`)

  const platformOn = s.platforms[deal.platform] ?? false
  if (s.extraordinary.enabled && isExtraordinary(deal, s.extraordinary.threshold) && (s.extraordinary.anyPlatform || platformOn)) {
    return { notify: true, matches: true, tier: 'extraordinary', reason: deal.priceError ? 'price error' : `${deal.percent}% off` }
  }
  if (!platformOn) return no('store switched off')
  if (s.keywords.length && !contains(deal.text, s.keywords)) return no('none of your keywords')
  if (deal.percent === null) {
    if (!s.includeNoDiscount) return no('no discount stated')
  } else {
    if (deal.upTo && !s.includeUpTo) return no('only an “up to” claim')
    if (deal.percent < s.minDiscount) return no(`${deal.percent}% is under your ${s.minDiscount}%`)
  }
  const quiet = inQuietHours(s.quiet, localHour)
  return { notify: !quiet, matches: true, tier: 'normal', reason: quiet ? 'quiet hours' : 'matches' }
}

/** Notification text for a deal. */
export function notificationFor(deal: Deal, tier: Tier): { title: string; body: string } {
  const pct = deal.percent === null ? '' : `${deal.upTo ? 'Up to ' : ''}${deal.percent}% off`
  const head = tier === 'extraordinary' ? (deal.priceError ? '🚨 Price error' : `🚨 ${pct}`) : pct || 'New offer'
  const store = deal.platform === 'other' ? deal.sourceName : storeName(deal.platform)
  const price = deal.price !== undefined ? ` · ₹${deal.price}${deal.mrp ? ` (MRP ₹${deal.mrp})` : ''}` : ''
  return { title: `${head} · ${store}`, body: `${deal.title}${price}` }
}

const storeName = (id: Deal['platform']) => platformById(id).name
