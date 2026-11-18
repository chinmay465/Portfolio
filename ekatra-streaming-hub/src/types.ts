export type ProviderId = 'netflix' | 'prime' | 'jiohotstar' | 'sonyliv' | 'zee5'

export type Kind = 'series' | 'film'

export type Genre =
  | 'Action'
  | 'Comedy'
  | 'Crime'
  | 'Drama'
  | 'Family'
  | 'Fantasy'
  | 'History'
  | 'Horror'
  | 'Mystery'
  | 'Politics'
  | 'Romance'
  | 'Sci-Fi'
  | 'Sports'
  | 'Thriller'
  | 'War'
  | 'Animation'

/** One title, normalised so the demo catalog and TMDB results look the same to the recommender. */
export interface Title {
  /** Stable key, e.g. `demo:panchayat` or `tmdb:tv:12345`. */
  id: string
  name: string
  kind: Kind
  year: number
  genres: Genre[]
  /** ISO 639-1 code of the original language. */
  language: string
  providers: ProviderId[]
  overview: string
  /** TMDB vote average, 0–10 (TMDB only; the demo catalog doesn't invent ratings). */
  rating?: number
  /** Relative popularity, 0–1 within its source. For the demo catalog it's an editorial weight. */
  popularity: number
  /** Extra similarity hints (demo catalog only). */
  tags?: string[]
  /** Full poster URL (TMDB only). */
  poster?: string
  /** TMDB's "where to watch" page for India (TMDB only). */
  watchLink?: string
}

/** What the user has told us. Keys are Title ids. */
export interface Signals {
  liked: string[]
  disliked: string[]
  watchlist: string[]
  /** Title id → play count (from Netflix history import or "watched" taps). */
  watched: Record<string, number>
}

export type Reaction = 'like' | 'dislike' | 'save' | 'watched'

export const EMPTY_SIGNALS: Signals = { liked: [], disliked: [], watchlist: [], watched: {} }
