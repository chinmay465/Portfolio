// Checks Telegram channels and feeds without a database: `npm run probe -- desidime somechannel`.
// With no arguments it probes the default sources. CI runs it to keep the default list honest.
import { toDeal } from '../shared/deal.ts'
import { parseFeed } from '../shared/parse/rss.ts'
import { parseTelegram, telegramUrl } from '../shared/parse/telegram.ts'
import { DEFAULT_SOURCES, cleanChannel } from '../shared/types.ts'
import type { SourceDef } from '../shared/types.ts'
import { pickFetch } from './fetch.ts'

const args = process.argv.slice(2)
const strict = args.includes('--strict')
const names = args.filter((a) => !a.startsWith('--'))
const sources: SourceDef[] = names.length
  ? names.map((n) => (/^https?:\/\//.test(n) && !/t\.me/.test(n)
      ? { id: n, kind: 'rss', url: n, name: n, enabled: true }
      : { id: n, kind: 'telegram', channel: cleanChannel(n) ?? n, name: n, enabled: true }))
  : DEFAULT_SOURCES
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
    if (!deals.length) failed++
  } catch (err) {
    failed++
    console.log(`ERR ${s.name.padEnd(28)} ${(err as Error).message}`)
  }
}
if (strict && failed) process.exit(1)
