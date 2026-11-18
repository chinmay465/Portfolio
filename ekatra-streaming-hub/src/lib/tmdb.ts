import { PROVIDERS } from '../data/providers.ts'
import type { Genre, Kind, ProviderId, Title } from '../types.ts'

/**
 * Live catalog from TMDB (themoviedb.org). Streaming availability on TMDB comes from JustWatch.
 * The user supplies their own free API key, kept in localStorage and sent only to api.themoviedb.org.
 */

const API = 'https://api.themoviedb.org/3'
const IMG = 'https://image.tmdb.org/t/p'
export const REGION = 'IN'

type MediaType = 'movie' | 'tv'

export interface RawTitle {
  id: number
  title?: string
  name?: string
  release_date?: string
  first_air_date?: string
  genre_ids?: number[]
  original_language?: string
  overview?: string
  vote_average?: number
  popularity?: number
  poster_path?: string | null
  backdrop_path?: string | null
  media_type?: string
}

interface RawProvider {
  provider_id: number
  provider_name: string
}

/** TMDB genre ids (movie and TV lists share ids where they overlap) → our genres. */
const GENRES: Record<number, Genre[]> = {
  28: ['Action'],
  12: ['Action'],
  16: ['Animation'],
  35: ['Comedy'],
  80: ['Crime'],
  18: ['Drama'],
  10751: ['Family'],
  10762: ['Family'],
  14: ['Fantasy'],
  36: ['History'],
  27: ['Horror'],
  9648: ['Mystery'],
  10749: ['Romance'],
  878: ['Sci-Fi'],
  53: ['Thriller'],
  10752: ['War'],
  37: ['Action'],
  10759: ['Action'],
  10765: ['Sci-Fi', 'Fantasy'],
  10768: ['War', 'Politics'],
}

export function mapGenres(ids: number[] = []): Genre[] {
  return [...new Set(ids.flatMap((id) => GENRES[id] ?? []))]
}

/** A v4 read-access token is a JWT ("eyJ…") and goes in a Bearer header; a v3 key goes in the query string. */
export function authorise(key: string, url: URL): HeadersInit {
  const k = key.trim()
  if (k.startsWith('eyJ')) return { Authorization: `Bearer ${k}`, accept: 'application/json' }
  url.searchParams.set('api_key', k)
  return { accept: 'application/json' }
}

export class TmdbError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function get<T>(key: string, path: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(API + path)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
  const res = await fetch(url, { headers: authorise(key, url) })
  if (!res.ok) {
    throw new TmdbError(res.status, res.status === 401 ? 'TMDB rejected the API key.' : `TMDB error ${res.status}`)
  }
  return (await res.json()) as T
}

/** Maps TMDB's provider list for India onto our services by name. */
export function mapProviderList(list: RawProvider[]): Partial<Record<ProviderId, number[]>> {
  const out: Partial<Record<ProviderId, number[]>> = {}
  for (const raw of list) {
    const p = PROVIDERS.find((x) => x.tmdbName.test(raw.provider_name.trim()))
    if (p) out[p.id] = [...new Set([...(out[p.id] ?? []), raw.provider_id])]
  }
  return out
}

export function providersFromNames(names: string[]): ProviderId[] {
  return PROVIDERS.filter((p) => names.some((n) => p.tmdbName.test(n.trim()))).map((p) => p.id)
}

export function toTitle(raw: RawTitle, type: MediaType, providers: ProviderId[] = []): Title {
  const date = raw.release_date || raw.first_air_date || ''
  const image = raw.backdrop_path ?? raw.poster_path
  return {
    id: `tmdb:${type}:${raw.id}`,
    name: raw.title ?? raw.name ?? 'Untitled',
    kind: (type === 'tv' ? 'series' : 'film') satisfies Kind,
    year: Number(date.slice(0, 4)) || 0,
    genres: mapGenres(raw.genre_ids),
    language: raw.original_language ?? 'en',
    providers,
    overview: raw.overview ?? '',
    rating: raw.vote_average,
    popularity: raw.popularity ?? 0,
    poster: image ? `${IMG}/${raw.backdrop_path ? 'w780' : 'w500'}${image}` : undefined,
    watchLink: `https://www.themoviedb.org/${type}/${raw.id}/watch?locale=${REGION}`,
  }
}

/** Rescales raw TMDB popularity to a 0–1 percentile so it mixes with similarity scores. */
export function rankPopularity(titles: Title[]): Title[] {
  const sorted = [...titles].sort((a, b) => a.popularity - b.popularity)
  const rank = new Map(sorted.map((t, i) => [t.id, sorted.length > 1 ? i / (sorted.length - 1) : 1]))
  return titles.map((t) => ({ ...t, popularity: rank.get(t.id) ?? 0 }))
}

export async function loadProviderIds(key: string) {
  const [movie, tv] = await Promise.all(
    (['movie', 'tv'] as const).map((type) =>
      get<{ results: RawProvider[] }>(key, `/watch/providers/${type}`, { watch_region: REGION }),
    ),
  )
  return mapProviderList([...movie.results, ...tv.results])
}

/**
 * Builds the recommendation pool: the most popular subscription titles on each chosen service,
 * films and series, a few pages each. Titles on more than one service keep all of them.
 */
export async function loadPool(key: string, services: ProviderId[], pages = 2): Promise<Title[]> {
  const ids = await loadProviderIds(key)
  const wanted = services.length ? services : PROVIDERS.map((p) => p.id)
  const jobs: Promise<Title[]>[] = []
  for (const service of wanted) {
    const providerIds = ids[service]
    if (!providerIds?.length) continue
    for (const type of ['movie', 'tv'] as const) {
      for (let page = 1; page <= pages; page++) {
        jobs.push(
          get<{ results: RawTitle[] }>(key, `/discover/${type}`, {
            watch_region: REGION,
            with_watch_providers: providerIds.join('|'),
            with_watch_monetization_types: 'flatrate',
            sort_by: 'popularity.desc',
            page,
          }).then((r) => r.results.map((raw) => toTitle(raw, type, [service]))),
        )
      }
    }
  }
  return rankPopularity(mergeTitles((await Promise.all(jobs)).flat()))
}

export function mergeTitles(titles: Title[]): Title[] {
  const byId = new Map<string, Title>()
  for (const t of titles) {
    const prev = byId.get(t.id)
    byId.set(t.id, prev ? { ...prev, providers: [...new Set([...prev.providers, ...t.providers])] } : t)
  }
  return [...byId.values()]
}

export async function fetchProviders(key: string, title: Title): Promise<ProviderId[]> {
  const [, type, id] = title.id.split(':')
  const r = await get<{ results: Record<string, { flatrate?: RawProvider[] }> }>(key, `/${type}/${id}/watch/providers`)
  return providersFromNames((r.results[REGION]?.flatrate ?? []).map((p) => p.provider_name))
}

/** Searches films and series, then looks up where each of the top hits streams in India. */
export async function searchTitles(key: string, query: string, limit = 12): Promise<Title[]> {
  const r = await get<{ results: RawTitle[] }>(key, '/search/multi', { query, region: REGION, include_adult: 'false' })
  const hits = r.results
    .filter((x): x is RawTitle & { media_type: MediaType } => x.media_type === 'movie' || x.media_type === 'tv')
    .slice(0, limit)
    .map((raw) => toTitle(raw, raw.media_type))
  const providers = await Promise.all(hits.map((t) => fetchProviders(key, t).catch(() => [] as ProviderId[])))
  return rankPopularity(hits.map((t, i) => ({ ...t, providers: providers[i] })))
}
