import { matchDeal, notificationFor, toDeal } from '../shared/deal.ts'
import { parseFeed } from '../shared/parse/rss.ts'
import { parseTelegram, telegramUrl } from '../shared/parse/telegram.ts'
import type { RawPost } from '../shared/parse/telegram.ts'
import { DEFAULT_SOURCES } from '../shared/types.ts'
import type { ScanSummary, SourceReport } from '../shared/api-types.ts'
import type { Deal, SourceDef } from '../shared/types.ts'

export type { ScanSummary, SourceReport }
import type { PushSender } from '../server/push.ts'
import type { Store, Subscriber } from '../server/store.ts'
import type { FetchText } from './fetch.ts'

/** Max single alerts per subscriber per scan; the rest go into one summary alert. */
const MAX_ALERTS = 5
/** Extra history pages per Telegram channel when more posts arrived than one page holds. */
const MAX_EXTRA_PAGES = 2

/** The default sources plus every public channel a subscriber added, once each. */
export function sourcesFor(subscribers: Pick<Subscriber, 'settings'>[], defaults: SourceDef[] = DEFAULT_SOURCES): SourceDef[] {
  const list = defaults.filter((s) => s.enabled)
  const seen = new Set(list.filter((s) => s.kind === 'telegram').map((s) => s.channel!.toLowerCase()))
  for (const sub of subscribers) {
    for (const ch of sub.settings.channels) {
      if (seen.has(ch.toLowerCase()) || seen.size >= 30) continue
      seen.add(ch.toLowerCase())
      list.push({ id: `tg:${ch.toLowerCase()}`, kind: 'telegram', channel: ch, name: `@${ch}`, enabled: true })
    }
  }
  return list
}

async function readSource(src: SourceDef, fetchText: FetchText, lastPostId: string | null): Promise<RawPost[]> {
  if (src.kind === 'rss') {
    const items = parseFeed(await fetchText(src.url!))
    if (!items.length) throw new Error('not a feed, or no items')
    return items
  }
  const channel = src.channel!
  let posts = parseTelegram(await fetchText(telegramUrl(channel)), channel)
  if (!posts.length) throw new Error('not a public channel, or no posts')
  // Busy channel: keep paging back until we reach a post we've already seen.
  const last = lastPostId ? Number(lastPostId) : null
  for (let page = 0; last !== null && page < MAX_EXTRA_PAGES; page++) {
    const oldest = Math.min(...posts.map((p) => Number(p.id)))
    if (oldest <= last + 1) break
    const older = parseTelegram(await fetchText(telegramUrl(channel, String(oldest))), channel)
    if (!older.length) break
    posts = [...older.filter((p) => Number(p.id) < oldest), ...posts]
  }
  return posts
}

const localHour = (tzOffset: number, now: number) => {
  const minutes = Math.floor(now / 60_000) - tzOffset
  return (((Math.floor(minutes / 60) % 24) + 24) % 24)
}

/** One check: read every source, store new deals, then send each subscriber what fits their settings. */
export async function runScan(
  store: Store,
  fetchText: FetchText,
  push: PushSender | null,
  now = Date.now(),
  defaults: SourceDef[] = DEFAULT_SOURCES,
): Promise<ScanSummary> {
  const subscribers = await store.subscribers()
  const sources = sourcesFor(subscribers, defaults)
  const reports: SourceReport[] = []

  // 1. Sources, four at a time.
  const queue = [...sources]
  async function worker() {
    for (let src = queue.shift(); src; src = queue.shift()) {
      try {
        const last = await store.lastPostId(src.id)
        const posts = await readSource(src, fetchText, last)
        const deals = posts.map((p) => toDeal(p, src))
        const fresh = await store.insertDeals(deals)
        const newest = src.kind === 'telegram' ? String(Math.max(...posts.map((p) => Number(p.id)))) : null
        await store.recordSource({ id: src.id, name: src.name, kind: src.kind, ok: true, posts: posts.length, lastPostId: newest })
        reports.push({ id: src.id, name: src.name, ok: true, posts: posts.length, fresh: fresh.length })
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        await store.recordSource({ id: src.id, name: src.name, kind: src.kind, ok: false, error, posts: 0 })
        reports.push({ id: src.id, name: src.name, ok: false, posts: 0, fresh: 0, error })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, sources.length) }, worker))

  // 2. Alerts: everything first seen in the last two days that this subscriber hasn't had.
  let pushes = 0
  if (push && subscribers.length) {
    const recent = await store.recentDeals({ sinceHours: 48, by: 'seen', limit: 500 })
    for (const sub of subscribers) {
      pushes += await alertSubscriber(store, push, sub, recent, now)
    }
    await store.dropFailing()
  }
  await store.prune()

  const summary: ScanSummary = {
    at: new Date(now).toISOString(),
    sources: reports.sort((a, b) => a.name.localeCompare(b.name)),
    newDeals: reports.reduce((n, r) => n + r.fresh, 0),
    pushes,
    subscribers: subscribers.length,
  }
  await store.setMeta('lastScan', JSON.stringify(summary))
  return summary
}

async function alertSubscriber(store: Store, push: PushSender, sub: Subscriber, recent: Deal[], now: number): Promise<number> {
  const hour = localHour(sub.tzOffset, now)
  const sent = await store.notifiedAmong(sub.id, recent.map((d) => d.id))
  const due = recent
    .filter((d) => !sent.has(d.id))
    .map((d) => ({ d, m: matchDeal(d, sub.settings, now, hour) }))
    .filter((x) => x.m.notify)
    // Extraordinary first, then biggest discount, then newest.
    .sort((a, b) =>
      (a.m.tier === 'extraordinary' ? 0 : 1) - (b.m.tier === 'extraordinary' ? 0 : 1) ||
      (b.d.percent ?? 0) - (a.d.percent ?? 0) ||
      Date.parse(b.d.postedAt) - Date.parse(a.d.postedAt))

  let count = 0
  const extra: Deal[] = []
  for (const { d, m } of due) {
    if (!(await store.claim(sub.id, d.id))) continue
    if (count >= MAX_ALERTS) {
      extra.push(d)
      continue
    }
    const text = notificationFor(d, m.tier!)
    const result = await push.send(sub, { ...text, url: d.url, tag: d.id, tier: m.tier!, image: d.image })
    if (result === 'gone') {
      await store.unsubscribe(sub.id)
      return count
    }
    await store.markPushed(sub.id, result === 'ok')
    if (result === 'ok') count++
  }
  if (extra.length) {
    const best = extra.reduce((a, b) => ((b.percent ?? 0) > (a.percent ?? 0) ? b : a))
    const result = await push.send(sub, {
      title: `${extra.length} more offers match your alerts`,
      body: `Best: ${notificationFor(best, 'normal').title}. Open Bachat to see them all.`,
      url: '/',
      tag: 'bachat-summary',
      tier: 'summary',
    })
    if (result === 'ok') count++
  }
  return count
}
