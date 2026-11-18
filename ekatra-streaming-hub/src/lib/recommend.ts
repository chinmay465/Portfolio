import type { Genre, Kind, ProviderId, Signals, Title } from '../types.ts'

type Vector = Map<string, number>

export type Filter = { kind?: Kind; genre?: Genre }

export type Reason =
  | { type: 'liked' | 'watched' | 'saved'; seed: Title }
  | { type: 'popular'; provider: ProviderId }

export interface Pick {
  title: Title
  score: number
  reason: Reason
}

const WEIGHTS = { genre: 1, tag: 0.8, language: 0.6, kind: 0.3, decade: 0.2 }

/** Content features of a title. Shared tags and genres carry most of the weight. */
export function vectorize(t: Title): Vector {
  const v: Vector = new Map()
  for (const g of t.genres) v.set(`g:${g}`, WEIGHTS.genre)
  for (const tag of t.tags ?? []) v.set(`t:${tag}`, WEIGHTS.tag)
  v.set(`l:${t.language}`, WEIGHTS.language)
  v.set(`k:${t.kind}`, WEIGHTS.kind)
  v.set(`d:${Math.floor(t.year / 10) * 10}`, WEIGHTS.decade)
  return v
}

export function cosine(a: Vector, b: Vector): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (const [k, x] of a) {
    na += x * x
    const y = b.get(k)
    if (y !== undefined) dot += x * y
  }
  for (const y of b.values()) nb += y * y
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb)
}

/** How much each kind of signal moves the taste profile. */
export function signalWeight(signals: Signals, id: string): number {
  if (signals.disliked.includes(id)) return -1
  let w = 0
  if (signals.liked.includes(id)) w += 1
  const plays = signals.watched[id] ?? 0
  if (plays > 0) w += Math.min(1, 0.4 + 0.2 * Math.log2(plays + 1))
  if (signals.watchlist.includes(id)) w += 0.5
  return w
}

/** Weighted sum of every title the user has reacted to. Empty when there's nothing to go on. */
export function buildProfile(pool: Title[], signals: Signals): Vector {
  const profile: Vector = new Map()
  for (const t of pool) {
    const w = signalWeight(signals, t.id)
    if (w === 0) continue
    for (const [k, x] of vectorize(t)) profile.set(k, (profile.get(k) ?? 0) + w * x)
  }
  // Negative totals only push away; they shouldn't count towards the profile's length.
  for (const [k, x] of profile) if (x <= 0) profile.delete(k)
  return profile
}

export function onServices(t: Title, services: ProviderId[]): boolean {
  return services.length === 0 || t.providers.some((p) => services.includes(p))
}

function matches(t: Title, filter: Filter): boolean {
  return (!filter.kind || t.kind === filter.kind) && (!filter.genre || t.genres.includes(filter.genre))
}

function seedsOf(pool: Title[], signals: Signals) {
  const byId = new Map(pool.map((t) => [t.id, t]))
  const seeds: { title: Title; type: 'liked' | 'watched' | 'saved'; vec: Vector }[] = []
  const add = (id: string, type: 'liked' | 'watched' | 'saved') => {
    const title = byId.get(id)
    if (title && !seeds.some((s) => s.title.id === id)) seeds.push({ title, type, vec: vectorize(title) })
  }
  // Most recent first, likes before plays before saves.
  for (const id of [...signals.liked].reverse()) add(id, 'liked')
  for (const [id] of Object.entries(signals.watched).sort((a, b) => b[1] - a[1])) add(id, 'watched')
  for (const id of [...signals.watchlist].reverse()) add(id, 'saved')
  return seeds
}

/** Lowers the score of a pick when the last few picks came from the same service or genre. */
function diversify(scored: Pick[], limit: number): Pick[] {
  const remaining = [...scored]
  const out: Pick[] = []
  while (out.length < limit && remaining.length > 0) {
    const recent = out.slice(-4)
    let best = 0
    let bestScore = -Infinity
    for (let i = 0; i < Math.min(remaining.length, 25); i++) {
      const c = remaining[i]
      const sameService = recent.filter((p) => p.title.providers[0] === c.title.providers[0]).length
      const sameGenre = recent.slice(-3).filter((p) => p.title.genres[0] === c.title.genres[0]).length
      const s = c.score - 0.06 * sameService - 0.04 * sameGenre
      if (s > bestScore) {
        bestScore = s
        best = i
      }
    }
    out.push(remaining.splice(best, 1)[0])
  }
  return out
}

/**
 * The home feed: titles on the user's services that they haven't reacted to,
 * ranked by similarity to their taste with popularity as the tie-breaker, then mixed across services.
 */
export function recommend(
  pool: Title[],
  signals: Signals,
  services: ProviderId[],
  filter: Filter = {},
  limit = 40,
): Pick[] {
  const profile = buildProfile(pool, signals)
  const seeds = seedsOf(pool, signals)
  const negatives = pool.filter((t) => signals.disliked.includes(t.id)).map(vectorize)
  const seen = new Set([
    ...signals.liked,
    ...signals.disliked,
    ...signals.watchlist,
    ...Object.keys(signals.watched),
  ])

  const scored: Pick[] = []
  for (const t of pool) {
    if (seen.has(t.id) || !onServices(t, services) || !matches(t, filter)) continue
    const vec = vectorize(t)
    const quality = t.rating !== undefined ? t.rating / 10 : t.popularity
    let score: number
    let reason: Reason
    if (profile.size === 0) {
      score = 0.7 * t.popularity + 0.3 * quality
      reason = { type: 'popular', provider: firstOn(t, services) }
    } else {
      const taste = cosine(profile, vec)
      const avoid = negatives.reduce((m, n) => Math.max(m, cosine(n, vec)), 0)
      score = 0.7 * taste + 0.2 * t.popularity + 0.1 * quality - 0.3 * avoid
      reason = explain(vec, seeds) ?? { type: 'popular', provider: firstOn(t, services) }
    }
    scored.push({ title: t, score, reason })
  }
  scored.sort((a, b) => b.score - a.score)
  return diversify(scored, limit)
}

function firstOn(t: Title, services: ProviderId[]): ProviderId {
  return t.providers.find((p) => services.includes(p)) ?? t.providers[0]
}

function explain(vec: Vector, seeds: ReturnType<typeof seedsOf>): Reason | undefined {
  let best: (typeof seeds)[number] | undefined
  let bestSim = 0.45
  for (const s of seeds) {
    const sim = cosine(s.vec, vec)
    if (sim > bestSim) {
      bestSim = sim
      best = s
    }
  }
  return best && { type: best.type, seed: best.title }
}

/** "More like this": nearest titles to one title, on the user's services. */
export function similarTo(
  title: Title,
  pool: Title[],
  services: ProviderId[],
  exclude: string[] = [],
  limit = 12,
): Title[] {
  const vec = vectorize(title)
  return pool
    .filter((t) => t.id !== title.id && !exclude.includes(t.id) && onServices(t, services))
    .map((t) => ({ t, s: cosine(vec, vectorize(t)) + 0.05 * t.popularity }))
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.t)
}
