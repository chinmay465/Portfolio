/**
 * Made-up catalogue and the on-phone recommender for the Ekatra for Android
 * demo. The titles are invented; the services are the five the app covers.
 * The recommender is the app's own (`data/Taste.kt`), ported line for line.
 */

export type ServiceKey = 'netflix' | 'prime' | 'jiohotstar' | 'sonyliv' | 'zee5'

export interface DemoService {
  key: ServiceKey
  name: string
  badge: string
  color: string
  host: string
  /** Installed on the demo phone. The others open on their website in Ekatra. */
  installed: boolean
  /** Has a search page that opens from outside (Netflix, Prime Video). */
  searchable: boolean
}

export const SERVICES: DemoService[] = [
  { key: 'netflix', name: 'Netflix', badge: 'NETFLIX', color: '#d81f26', host: 'www.netflix.com', installed: true, searchable: true },
  { key: 'prime', name: 'Prime Video', badge: 'PRIME', color: '#1f8fe0', host: 'www.primevideo.com', installed: true, searchable: true },
  { key: 'jiohotstar', name: 'JioHotstar', badge: 'HOTSTAR', color: '#2f55d4', host: 'www.hotstar.com', installed: true, searchable: false },
  { key: 'sonyliv', name: 'SonyLIV', badge: 'SONYLIV', color: '#c99a2e', host: 'www.sonyliv.com', installed: false, searchable: false },
  { key: 'zee5', name: 'ZEE5', badge: 'ZEE5', color: '#8b3fd9', host: 'www.zee5.com', installed: false, searchable: false },
]

export const serviceBy = (key: ServiceKey) => SERVICES.find((s) => s.key === key)!

export interface DemoTitle {
  id: string
  name: string
  kind: 'Film' | 'Series'
  year: number
  genres: string[]
  tags: string[]
  language: string
  services: ServiceKey[]
  /** Hue of the generated artwork. */
  hue: number
  overview: string
  rating: number
  /** Series: seasons. Films: runtime in minutes. */
  length: number
  popularity: number
  cast: string[]
  /** Services where JustWatch knows the exact title page. */
  exact: ServiceKey[]
}

function t(
  id: string,
  name: string,
  kind: 'Film' | 'Series',
  year: number,
  genres: string[],
  language: string,
  services: ServiceKey[],
  popularity: number,
  tags: string[],
  hue: number,
  rating: number,
  length: number,
  overview: string,
  cast: string[],
): DemoTitle {
  // Exact title links: the demo knows them for the services that have most of their catalogue on JustWatch.
  const exact = services.filter((s) => s === 'netflix' || s === 'prime' || s === 'sonyliv')
  return { id, name, kind, year, genres, language, services, popularity, tags, hue, rating, length, overview, cast, exact }
}

export const TITLES: DemoTitle[] = [
  t('monsoon-files', 'Monsoon Files', 'Series', 2025, ['Crime', 'Thriller'], 'hi', ['netflix'], 0.95, ['cop', 'mumbai', 'rain'], 205, 8.4, 2, 'A Mumbai inspector has one wet July to link six drownings that the city calls accidents.', ['Ira Kale', 'Dev Rao', 'Sana Mir']),
  t('last-local', 'The Last Local', 'Film', 2024, ['Thriller'], 'hi', ['netflix'], 0.8, ['train', 'mumbai', 'one-night'], 12, 7.6, 118, 'Eight strangers, one stalled midnight train and a bag nobody will claim.', ['Arjun Shetty', 'Meera Pai']),
  t('kitchen-kings', 'Kitchen Kings', 'Series', 2023, ['Comedy', 'Drama'], 'hi', ['netflix'], 0.75, ['food', 'family', 'slice-of-life'], 32, 8.1, 3, 'Three brothers inherit a failing Pune dhaba and one recipe book written in code.', ['Rohan Joshi', 'Kabir Das']),
  t('orbit-nine', 'Orbit 9', 'Series', 2025, ['Sci-Fi', 'Drama'], 'en', ['netflix'], 0.85, ['space', 'survival'], 250, 8.0, 1, 'The crew of India’s first space station lose contact with Earth on day nine.', ['Nila Iyer', 'Sam Okafor']),
  t('paper-crowns', 'Paper Crowns', 'Series', 2024, ['Drama', 'History'], 'hi', ['netflix'], 0.65, ['period', 'royalty'], 40, 7.9, 1, 'A princely state signs away its throne in 1948, and its queen refuses to leave.', ['Tara Singh', 'Vikram Bhosle']),
  t('ganga-gold', 'Ganga Gold', 'Series', 2024, ['Crime', 'Action'], 'hi', ['prime'], 0.9, ['gangster', 'small-town', 'uttar-pradesh'], 45, 8.2, 3, 'Sand mining money turns two childhood friends in Kanpur into rivals.', ['Aman Tiwari', 'Ruhi Khan']),
  t('village-wifi', 'Village Wi-Fi', 'Series', 2025, ['Comedy'], 'hi', ['prime'], 0.92, ['village', 'slice-of-life', 'small-town'], 95, 8.8, 4, 'A techie posted to a hill village promises everyone internet by Diwali.', ['Kunal Verma', 'Asha Devi']),
  t('red-signal', 'Red Signal', 'Film', 2025, ['Action', 'Thriller'], 'hi', ['prime'], 0.7, ['spy', 'delhi'], 0, 7.2, 132, 'A traffic cop decodes the pattern behind Delhi’s broken signals: a heist in motion.', ['Rahul Sen', 'Pooja Nair']),
  t('ninth-house', 'The Ninth House', 'Series', 2023, ['Fantasy', 'Mystery'], 'en', ['prime'], 0.6, ['supernatural', 'family'], 275, 7.4, 2, 'A family moves into a Shimla house whose ninth room appears only in fog.', ['Lena Roy', 'Ishaan Mehta']),
  t('iron-desert', 'Iron Desert', 'Film', 2024, ['War', 'Drama'], 'hi', ['jiohotstar'], 0.75, ['army', 'true-story'], 30, 8.0, 141, 'Fourteen soldiers hold a desert outpost for three days without orders.', ['Karan Gill', 'Nikhil Rana']),
  t('dragons-deccan', 'Dragons of the Deccan', 'Series', 2025, ['Fantasy', 'Action'], 'en', ['jiohotstar'], 0.95, ['epic', 'dragons'], 18, 8.6, 2, 'Rival kingdoms bargain with the last dragons above the Western Ghats.', ['Maya Desai', 'Jon Pereira']),
  t('signal-lost', 'Signal Lost', 'Series', 2024, ['Sci-Fi', 'Thriller'], 'en', ['jiohotstar'], 0.7, ['tech', 'survival'], 190, 7.7, 1, 'Every phone in Bengaluru goes dark at once, except one.', ['Ana Thomas', 'Ravi Kumar']),
  t('cricket-mad', 'Cricket Mad', 'Film', 2023, ['Comedy', 'Sports'], 'hi', ['jiohotstar'], 0.65, ['cricket', 'small-town'], 140, 7.3, 124, 'A mohalla team needs eleven players and has nine, a goat and a grandmother.', ['Sunny Patil', 'Gita Rao']),
  t('dalal-92', 'Dalal Street ’92', 'Series', 2024, ['Crime', 'Drama', 'History'], 'hi', ['sonyliv'], 0.9, ['true-story', 'finance', 'mumbai'], 160, 9.1, 1, 'A broker from a one-room chawl becomes the Big Bull, and then the biggest scandal.', ['Pratik Shah', 'Hema Kulkarni']),
  t('rocket-village', 'Rocket Village', 'Series', 2023, ['Drama', 'History'], 'hi', ['sonyliv'], 0.7, ['science', 'true-story', 'period'], 220, 8.7, 2, 'Scientists build India’s first rockets in a church by the sea.', ['Aditya Menon', 'Zoya Ali']),
  t('mishra-house', 'The Mishra House', 'Series', 2025, ['Comedy', 'Family'], 'hi', ['sonyliv'], 0.8, ['family', 'small-town', 'slice-of-life'], 60, 9.0, 4, 'Small fights and small joys of one family in Bhopal, one rupee at a time.', ['Vaibhav Raj', 'Geetanjali Kul']),
  t('society-4', 'Society No. 4', 'Series', 2024, ['Comedy', 'Crime'], 'hi', ['zee5'], 0.6, ['murder-mystery', 'mumbai'], 300, 7.5, 2, 'A murder in a Mumbai housing society, and every uncle has a theory.', ['Sunil Bhatt', 'Riya Sen']),
  t('gorakhpur-rising', 'Gorakhpur Rising', 'Series', 2023, ['Crime', 'Action'], 'hi', ['zee5'], 0.55, ['gangster', 'uttar-pradesh', 'true-story'], 8, 7.6, 2, 'A college topper becomes the most feared name in eastern UP.', ['Saqib Naqvi', 'Anu Yadav']),
  t('news-tonight', 'News Tonight', 'Series', 2025, ['Drama'], 'hi', ['zee5', 'prime'], 0.5, ['journalism', 'mumbai'], 210, 7.1, 1, 'Two news channels, one honest and one loud, fight over the same story.', ['Jaya Iyer', 'Om Puri Jr']),
  t('north-star', 'North Star', 'Film', 2025, ['Sci-Fi', 'Family'], 'en', ['netflix', 'jiohotstar'], 0.8, ['space', 'coming-of-age'], 230, 7.8, 104, 'A Ladakh schoolgirl builds a radio telescope from satellite dishes.', ['Dolma Angmo', 'Rafi Hasan']),
  t('chai-chronicles', 'Chai Chronicles', 'Series', 2024, ['Comedy', 'Romance'], 'hi', ['prime', 'sonyliv'], 0.75, ['food', 'slice-of-life', 'delhi'], 25, 8.0, 2, 'A tea stall in Chandni Chowk overhears every love story in Old Delhi.', ['Neha Garg', 'Arif Khan']),
  t('deep-cut', 'Deep Cut', 'Film', 2024, ['Thriller', 'Mystery'], 'en', ['netflix', 'prime'], 0.7, ['murder-mystery', 'investigator'], 340, 7.5, 109, 'A film editor finds a murder hidden in two frames of a wedding video.', ['Elena Shah', 'Marc D’Souza']),
  t('high-tide', 'High Tide', 'Series', 2025, ['Drama', 'Thriller'], 'ml', ['jiohotstar'], 0.65, ['fishing', 'family', 'kerala'], 175, 8.3, 1, 'A Kochi fishing family hides a drowned stranger from the coast guard.', ['Anna Ben', 'Joju Varghese']),
  t('code-red', 'Code Red', 'Series', 2025, ['Thriller', 'Action'], 'hi', ['netflix'], 0.7, ['spy', 'tech', 'delhi'], 355, 7.7, 1, 'A hacker on parole is the only one who can stop an attack she wrote.', ['Kriti Bose', 'Imran Ali']),
]

export const titleById = (id: string) => TITLES.find((x) => x.id === id)

export const art = (hue: number, color?: string) =>
  `linear-gradient(150deg, ${color ?? `hsl(${hue} 80% 55%)`} 0%, hsl(${(hue + 40) % 360} 70% 38% / 0.85) 55%, #07070c 100%)`

export const facts = (x: DemoTitle) =>
  [x.year, x.kind === 'Series' ? `${x.length} season${x.length === 1 ? '' : 's'}` : `${Math.floor(x.length / 60)}h ${x.length % 60}m`, `★ ${x.rating.toFixed(1)}`, x.language.toUpperCase()].join(' · ')

// ------------------------------------------------------------------ signals and recommender

export interface Opened {
  id: string
  service: ServiceKey
  at: number
}

export interface Signals {
  liked: string[]
  disliked: string[]
  /** Newest last. */
  saved: string[]
  opened: Record<string, number>
  /** Newest first. */
  history: Opened[]
}

export const EMPTY: Signals = { liked: [], disliked: [], saved: [], opened: {}, history: [] }

type Vector = Map<string, number>

export function vector(x: DemoTitle): Vector {
  const v: Vector = new Map()
  for (const g of x.genres) v.set(`g:${g}`, 1)
  for (const tag of x.tags) v.set(`t:${tag}`, 0.8)
  v.set(`l:${x.language}`, 0.6)
  v.set(`k:${x.kind}`, 0.3)
  v.set(`d:${Math.floor(x.year / 10) * 10}`, 0.2)
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

export function weight(s: Signals, id: string): number {
  if (s.disliked.includes(id)) return -1
  let w = 0
  if (s.liked.includes(id)) w += 1
  const opens = s.opened[id] ?? 0
  if (opens > 0) w += Math.min(1, 0.4 + 0.2 * Math.log2(opens + 1))
  if (s.saved.includes(id)) w += 0.5
  return w
}

export type Reason = { type: 'liked' | 'opened' | 'saved'; seed: DemoTitle } | { type: 'popular'; service: ServiceKey }

export interface Pick {
  title: DemoTitle
  score: number
  reason: Reason
}

export const onServices = (x: DemoTitle, services: ServiceKey[]) => services.length === 0 || x.services.some((s) => services.includes(s))

export function reasonText(r: Reason): string {
  if (r.type === 'popular') return `Popular on ${serviceBy(r.service).name}`
  const name = r.seed.name.split(':')[0]
  if (r.type === 'liked') return `Because you liked ${name}`
  if (r.type === 'opened') return `Because you watched ${name}`
  return `Like ${name} in My List`
}

export function recommend(pool: DemoTitle[], s: Signals, services: ServiceKey[], limit = 30): Pick[] {
  const profile: Vector = new Map()
  for (const x of pool) {
    const w = weight(s, x.id)
    if (w === 0) continue
    for (const [k, v] of vector(x)) profile.set(k, (profile.get(k) ?? 0) + w * v)
  }
  for (const [k, v] of profile) if (v <= 0) profile.delete(k)

  const byId = new Map(pool.map((x) => [x.id, x]))
  const seeds: { title: DemoTitle; type: 'liked' | 'opened' | 'saved'; vec: Vector }[] = []
  const add = (id: string, type: 'liked' | 'opened' | 'saved') => {
    const title = byId.get(id)
    if (title && !seeds.some((x) => x.title.id === id)) seeds.push({ title, type, vec: vector(title) })
  }
  for (const id of [...s.liked].reverse()) add(id, 'liked')
  for (const [id] of Object.entries(s.opened).sort((a, b) => b[1] - a[1])) add(id, 'opened')
  for (const id of [...s.saved].reverse()) add(id, 'saved')

  const avoid = pool.filter((x) => s.disliked.includes(x.id)).map(vector)
  const seen = new Set([...s.liked, ...s.disliked, ...s.saved, ...Object.keys(s.opened)])
  const first = (x: DemoTitle) => x.services.find((k) => services.includes(k)) ?? x.services[0]

  const scored: Pick[] = []
  for (const x of pool) {
    if (seen.has(x.id) || !onServices(x, services)) continue
    const vec = vector(x)
    const quality = x.rating / 10
    if (profile.size === 0) {
      scored.push({ title: x, score: 0.7 * x.popularity + 0.3 * quality, reason: { type: 'popular', service: first(x) } })
      continue
    }
    const taste = cosine(profile, vec)
    const away = avoid.reduce((m, n) => Math.max(m, cosine(n, vec)), 0)
    let best: (typeof seeds)[number] | undefined
    let bestSim = 0.45
    for (const seed of seeds) {
      const sim = cosine(seed.vec, vec)
      if (sim > bestSim) {
        bestSim = sim
        best = seed
      }
    }
    scored.push({
      title: x,
      score: 0.7 * taste + 0.2 * x.popularity + 0.1 * quality - 0.3 * away,
      reason: best ? { type: best.type, seed: best.title } : { type: 'popular', service: first(x) },
    })
  }
  scored.sort((a, b) => b.score - a.score)

  // Mix services: a pick loses a little for each of the last few picks from the same service or genre.
  const out: Pick[] = []
  while (out.length < limit && scored.length > 0) {
    const recent = out.slice(-4)
    let bi = 0
    let bs = -Infinity
    for (let i = 0; i < Math.min(scored.length, 25); i++) {
      const c = scored[i]
      const sameService = recent.filter((p) => p.title.services[0] === c.title.services[0]).length
      const sameGenre = recent.slice(-3).filter((p) => p.title.genres[0] === c.title.genres[0]).length
      const v = c.score - 0.06 * sameService - 0.04 * sameGenre
      if (v > bs) {
        bs = v
        bi = i
      }
    }
    out.push(scored.splice(bi, 1)[0])
  }
  return out
}

export function similar(x: DemoTitle, pool: DemoTitle[], services: ServiceKey[], exclude: string[] = [], limit = 8): DemoTitle[] {
  const v = vector(x)
  return pool
    .filter((o) => o.id !== x.id && !exclude.includes(o.id) && onServices(o, services))
    .map((o) => ({ o, s: cosine(v, vector(o)) + 0.05 * o.popularity }))
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((r) => r.o)
}

// ------------------------------------------------------------------ hand-off

export type Step =
  | { kind: 'page'; exact: boolean; label: string }
  | { kind: 'home'; label: string }
  | { kind: 'web'; label: string }

/** The app's `Handoff.plan`: what it tries, in order, and where it stops. */
export function handoff(x: DemoTitle, s: DemoService, inEkatra: boolean): { steps: Step[]; lands: Step } {
  const web: Step = { kind: 'web', label: `${s.name}'s website, here in Ekatra` }
  if (inEkatra || !s.installed) return { steps: [web], lands: web }
  const steps: Step[] = []
  if (x.exact.includes(s.key)) steps.push({ kind: 'page', exact: true, label: `${x.name}'s own page in the ${s.name} app` })
  if (s.searchable) steps.push({ kind: 'page', exact: false, label: `${s.name}'s search for “${x.name}”` })
  steps.push({ kind: 'home', label: `${s.name} app, with “${x.name}” copied for its search` })
  return { steps, lands: steps[0] }
}
