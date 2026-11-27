import { PLATFORMS } from './types.ts'
import type { PlatformId } from './types.ts'

// Keep in step with android/.../core/Platforms.kt (checked against shared/fixtures/cases.json).

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const NAME_RES = PLATFORMS.map((p) => ({
  p,
  res: p.names.map((n) => new RegExp(`(?:^|[^a-z0-9])${escape(n)}(?![a-z0-9])`, 'i')),
}))

/** True when `url` is on `domain` (a host, optionally with a path prefix like `swiggy.com/instamart`). */
export function onDomain(url: string, domain: string): boolean {
  let host: string
  let path: string
  try {
    const u = new URL(url)
    host = u.hostname.toLowerCase()
    path = u.pathname.toLowerCase()
  } catch {
    return false
  }
  const slash = domain.indexOf('/')
  const dHost = slash < 0 ? domain : domain.slice(0, slash)
  const dPath = slash < 0 ? '' : domain.slice(slash)
  const hostOk = host === dHost || host.endsWith('.' + dHost)
  return hostOk && (!dPath || path.startsWith(dPath))
}

/** Which store a deal is for: store links first, then the earliest store name in the text. */
export function detectPlatform(text: string, links: string[] = []): PlatformId {
  // Links: the most specific domain match (swiggy.com/instamart beats swiggy.com).
  for (const link of links) {
    let best: { id: PlatformId; len: number } | null = null
    for (const p of PLATFORMS) {
      for (const d of p.domains) {
        if (onDomain(link, d) && (!best || d.length > best.len)) best = { id: p.id, len: d.length }
      }
    }
    if (best) return best.id
  }

  // Text: earliest mention, with "beats" (Instamart over Swiggy).
  const found: { id: PlatformId; at: number; beats: string[] }[] = []
  for (const { p, res } of NAME_RES) {
    let at = Infinity
    for (const re of res) {
      const m = re.exec(text)
      if (m) at = Math.min(at, m.index)
    }
    if (at !== Infinity) found.push({ id: p.id, at, beats: p.beats ?? [] })
  }
  if (!found.length) return 'other'
  const beaten = new Set(found.flatMap((f) => f.beats))
  const live = found.filter((f) => !beaten.has(f.id))
  live.sort((a, b) => a.at - b.at)
  return live[0].id
}
