import platformData from './data/platforms.json' with { type: 'json' }
import sourceData from './data/sources.json' with { type: 'json' }

export type PlatformId =
  | 'zomato' | 'swiggy' | 'instamart' | 'blinkit' | 'zepto' | 'bigbasket'
  | 'amazon' | 'flipkart' | 'myntra' | 'ajio' | 'nykaa' | 'jiomart'
  | 'pvr' | 'bookmyshow' | 'district' | 'other'

export interface Platform {
  id: PlatformId
  name: string
  group: 'food' | 'grocery' | 'shopping' | 'movies' | 'other'
  color: string
  names: string[]
  domains: string[]
  beats?: string[]
}

export const PLATFORMS = platformData.platforms as Platform[]
export const PLATFORM_IDS = PLATFORMS.map((p) => p.id)
export const platformById = (id: string): Platform => PLATFORMS.find((p) => p.id === id) ?? PLATFORMS[PLATFORMS.length - 1]

export interface SourceDef {
  id: string
  kind: 'telegram' | 'rss'
  name: string
  enabled: boolean
  channel?: string
  url?: string
  note?: string
}

export const DEFAULT_SOURCES = sourceData.sources as SourceDef[]

/** How the discount was worked out. */
export type DiscountKind = 'percent' | 'price' | 'flat' | 'bogo' | 'free'

export interface DiscountInfo {
  /** 0–100, or null when the post names no discount. */
  percent: number | null
  kind: DiscountKind | null
  /** Only an "up to X%" claim backs the number. */
  upTo: boolean
  price?: number
  mrp?: number
  /** "price error", "pricing glitch" and the like. */
  priceError: boolean
  /** The poster called it a loot. Shown as a tag only: the word is overused. */
  loot: boolean
}

export interface Deal extends DiscountInfo {
  /** `<source id>:<post id>`, stable across checks. */
  id: string
  source: string
  sourceName: string
  title: string
  text: string
  /** Where to buy: the first store link in the post, else the post itself. */
  url: string
  postUrl: string
  image?: string
  /** ISO time the post went up. */
  postedAt: string
  platform: PlatformId
}

export interface Settings {
  /** Notify when the discount is at least this (0–95). */
  minDiscount: number
  /** Platforms to notify for. */
  platforms: Record<PlatformId, boolean>
  /** Which offers count, by when they were posted. */
  ages: { now: boolean; earlier: boolean }
  /** "Now" means posted within this many hours. */
  nowHours: number
  /** Count "up to X% off" claims at face value. */
  includeUpTo: boolean
  /** Notify for coupons and offers that name no discount. */
  includeNoDiscount: boolean
  /** Extraordinary deals: 90%+ off or a price error. They skip quiet hours. */
  extraordinary: { enabled: boolean; threshold: number; anyPlatform: boolean }
  /** Only notify when the post mentions one of these (empty: everything). */
  keywords: string[]
  /** Never notify when the post mentions one of these. */
  muted: string[]
  /** No normal alerts between these local hours. */
  quiet: { enabled: boolean; from: number; to: number }
  /** Extra public Telegram channels to watch (usernames, no @). */
  channels: string[]
}

export const DEFAULT_SETTINGS: Settings = {
  minDiscount: 60,
  platforms: Object.fromEntries(PLATFORM_IDS.map((id) => [id, id !== 'other'])) as Record<PlatformId, boolean>,
  ages: { now: true, earlier: false },
  nowHours: 3,
  includeUpTo: true,
  includeNoDiscount: false,
  extraordinary: { enabled: true, threshold: 90, anyPlatform: true },
  keywords: [],
  muted: [],
  quiet: { enabled: false, from: 23, to: 7 },
  channels: [],
}

/** Fills gaps and clamps values, so stored or posted settings are always usable. */
export function normalizeSettings(input: unknown): Settings {
  const s = (input && typeof input === 'object' ? input : {}) as Partial<Settings>
  const d = DEFAULT_SETTINGS
  const num = (v: unknown, lo: number, hi: number, dflt: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : dflt
  const bool = (v: unknown, dflt: boolean) => (typeof v === 'boolean' ? v : dflt)
  const words = (v: unknown) =>
    Array.isArray(v)
      ? [...new Set(v.filter((w): w is string => typeof w === 'string').map((w) => w.trim().toLowerCase()).filter(Boolean))].slice(0, 30)
      : []
  const platforms = { ...d.platforms }
  if (s.platforms && typeof s.platforms === 'object') {
    for (const id of PLATFORM_IDS) {
      const v = (s.platforms as Record<string, unknown>)[id]
      if (typeof v === 'boolean') platforms[id] = v
    }
  }
  const channels = Array.isArray(s.channels)
    ? [...new Set(s.channels.map((c) => cleanChannel(String(c))).filter((c): c is string => Boolean(c)))].slice(0, 10)
    : []
  return {
    minDiscount: num(s.minDiscount, 0, 95, d.minDiscount),
    platforms,
    ages: { now: bool(s.ages?.now, d.ages.now), earlier: bool(s.ages?.earlier, d.ages.earlier) },
    nowHours: num(s.nowHours, 1, 48, d.nowHours),
    includeUpTo: bool(s.includeUpTo, d.includeUpTo),
    includeNoDiscount: bool(s.includeNoDiscount, d.includeNoDiscount),
    extraordinary: {
      enabled: bool(s.extraordinary?.enabled, d.extraordinary.enabled),
      threshold: num(s.extraordinary?.threshold, 50, 100, d.extraordinary.threshold),
      anyPlatform: bool(s.extraordinary?.anyPlatform, d.extraordinary.anyPlatform),
    },
    keywords: words(s.keywords),
    muted: words(s.muted),
    quiet: {
      enabled: bool(s.quiet?.enabled, d.quiet.enabled),
      from: num(s.quiet?.from, 0, 23, d.quiet.from),
      to: num(s.quiet?.to, 0, 23, d.quiet.to),
    },
    channels,
  }
}

/** A Telegram channel username from `@name`, `t.me/name` or `https://t.me/s/name`, or null. */
export function cleanChannel(raw: string): string | null {
  const m = raw.trim().match(/^(?:@|(?:https?:\/\/)?(?:www\.)?t(?:elegram)?\.me\/(?:s\/)?)?([A-Za-z][A-Za-z0-9_]{3,31})\/?$/)
  return m ? m[1] : null
}
