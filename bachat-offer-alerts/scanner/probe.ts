// Checks Telegram channels and feeds without a database: `npm run probe -- desidime somechannel`.
// With no arguments it probes the default sources. CI runs it to keep the default list honest.
import { toDeal } from '../shared/deal.ts'
import { parseFeed } from '../shared/parse/rss.ts'
import { parseTelegram, telegramUrl } from '../shared/parse/telegram.ts'
import { cleanChannel } from '../shared/types.ts'
import type { SourceDef } from '../shared/types.ts'
import { pickFetch, pickSources } from './fetch.ts'

const args = process.argv.slice(2)
const strict = args.includes('--strict')
/** Print every post as read: discount, store, flags and title. */
const show = args.includes('--show')
const names = args.filter((a) => !a.startsWith('--'))
const sources: SourceDef[] = names.length
  ? names.map((n) => (/^https?:\/\//.test(n) && !/t\.me/.test(n)
      ? { id: n, kind: 'rss', url: n, name: n, enabled: true }
      : { id: n, kind: 'telegram', channel: cleanChannel(n) ?? n, name: n, enabled: true }))
  : pickSources()
const fetchText = pickFetch()
let failed = 0
for (const s of sources) {
  try {
    const raw = s.kind === 'rss' ? parseFeed(await fetchText(s.url!)) : parseTelegram(await fetchText(telegramUrl(s.channel!)), s.channel!)
    const deals = raw.map((p) => toDeal(p, s))
    const withPct = deals.filter((d) => d.percent !== null)
    const newest = deals.map((d) => d.postedAt).sort().pop() ?? '-'
    const top = [...withPct].sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0))[0]
    console.log(`${deals.length ? 'ok ' : 'NO '} ${s.name.padEnd(28)} ${String(deals.length).padStart(3)} posts, ${String(withPct.length).padStart(3)} with a discount, newest ${newest}${top ? `, top ${top.percent}% ${top.platform}` : ''}`)
    if (show) {
      for (const d of deals) {
        const pct = d.percent === null ? '  — ' : `${d.upTo ? '≤' : ' '}${String(d.percent).padStart(3)}%`
        const flags = [d.kind, d.priceError && 'price-error', d.loot && 'loot'].filter(Boolean).join(',')
        console.log(`      ${pct} ${d.platform.padEnd(10)} ${flags.padEnd(16)} ${d.title.slice(0, 90)}`)
        // Unrecognised store: show what the post says, to grow shared/data/platforms.json.
        if (d.platform === 'other') {
          const hosts = [...new Set([d.url, d.postUrl].map((u) => { try { return new URL(u).hostname } catch { return '' } }))].join(' ')
          console.log(`              ↳ ${d.text.replace(/\s+/g, ' ').slice(0, 220)}  [${hosts}]`)
        }
      }
    }
    if (!deals.length) failed++
  } catch (err) {
    failed++
    console.log(`ERR ${s.name.padEnd(28)} ${(err as Error).message}`)
  }
}
if (strict && failed) process.exit(1)
