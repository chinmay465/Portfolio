// Dummy catalogue for the Swar demo. Every song, artist and album is made up.

export interface DemoSong {
  id: string
  title: string
  artist: string
  album: string
  secs: number
  /** Hue of the generated cover art. */
  hue: number
  mood: Mood
  /** Song and music-video audio bitrates, for songs that have a music video too. */
  video?: { song: number; video: number }
  /** Removed, private or blocked on YouTube Music: Swar hides it everywhere. */
  unavailable?: boolean
}

export interface DemoAlbum {
  id: string
  title: string
  artist: string
  year: number
  hue: number
  songs: string[]
}

export interface DemoArtist {
  id: string
  name: string
  hue: number
  album: string
}

export interface DemoMix {
  id: string
  title: string
  subtitle: string
  hue: number
  songs: string[]
}

/** A playlist of your own: songs can be added and taken out. */
export interface OwnPlaylist {
  id: string
  title: string
  hue: number
  songs: string[]
}

/** An album or playlist downloaded as a whole, kept together in Downloads. */
export interface DlGroup {
  key: string
  title: string
  hue: number
  isAlbum: boolean
  ids: string[]
}

export type Mood = 'Relax' | 'Focus' | 'Workout' | 'Romance'
export const MOODS: Mood[] = ['Relax', 'Focus', 'Workout', 'Romance']

const s = (id: string, title: string, artist: string, album: string, secs: number, hue: number, mood: Mood, extra: Partial<DemoSong> = {}): DemoSong => ({
  id, title, artist, album, secs, hue, mood, ...extra,
})

const ALL_SONGS: DemoSong[] = [
  s('s1', 'Monsoon Drive', 'Indie Pune', 'Western Ghats', 214, 196, 'Relax', { video: { song: 128, video: 141 } }),
  s('s2', 'Late Train Home', 'Lo-fi Mumbai', 'Platform 7', 187, 262, 'Focus'),
  s('s3', 'Konkan Coast', 'Coastal Folk', 'Salt & Sand', 241, 172, 'Relax'),
  s('s4', 'Night Shift', 'Synth Bengaluru', 'Outer Ring Road', 205, 290, 'Workout', { video: { song: 131, video: 128 } }),
  s('s5', 'Morning Raga', 'Sitar Trio', 'First Light', 263, 38, 'Focus'),
  s('s6', 'Chai at Dawn', 'Lo-fi Mumbai', 'Platform 7', 172, 24, 'Relax'),
  s('s7', 'Sahyadri Run', 'Synth Bengaluru', 'Outer Ring Road', 198, 330, 'Workout'),
  s('s8', 'Paper Boats', 'Indie Pune', 'Western Ghats', 226, 210, 'Romance', { video: { song: 128, video: 160 } }),
  s('s9', 'Tide Tables', 'Coastal Folk', 'Salt & Sand', 233, 150, 'Romance'),
  s('s10', 'Local at 9:12', 'Lo-fi Mumbai', 'Platform 7', 181, 280, 'Focus'),
  s('s11', 'Neon Silk Board', 'Synth Bengaluru', 'Outer Ring Road', 219, 316, 'Workout'),
  s('s12', 'Brass Lamp', 'Sitar Trio', 'First Light', 247, 46, 'Romance'),
  s('s13', 'Rain on Tin', 'Indie Pune', 'Western Ghats', 193, 188, 'Relax'),
  s('s14', 'Fishing Nets', 'Coastal Folk', 'Salt & Sand', 208, 164, 'Relax'),
  s('s15', 'Third Taal', 'Sitar Trio', 'First Light', 271, 30, 'Focus'),
  s('s16', 'Overpass', 'Synth Bengaluru', 'Outer Ring Road', 202, 300, 'Workout'),
  // Taken down on YouTube Music: in a playlist, but never shown or downloaded.
  s('s17', 'Old Demo Tape', 'Indie Pune', 'Western Ghats', 180, 200, 'Relax', { unavailable: true }),
]

/** Every song that can be played. Unavailable ones are left out of everything. */
export const SONGS: DemoSong[] = ALL_SONGS.filter((x) => !x.unavailable)
export const isAvailable = (id: string) => !ALL_SONGS.find((x) => x.id === id)?.unavailable

const songsOf = (album: string) => SONGS.filter((x) => x.album === album).map((x) => x.id)

export const ALBUMS: DemoAlbum[] = [
  { id: 'a1', title: 'Western Ghats', artist: 'Indie Pune', year: 2025, hue: 200, songs: songsOf('Western Ghats') },
  { id: 'a2', title: 'Platform 7', artist: 'Lo-fi Mumbai', year: 2026, hue: 268, songs: songsOf('Platform 7') },
  { id: 'a3', title: 'Salt & Sand', artist: 'Coastal Folk', year: 2024, hue: 160, songs: songsOf('Salt & Sand') },
  { id: 'a4', title: 'Outer Ring Road', artist: 'Synth Bengaluru', year: 2026, hue: 310, songs: songsOf('Outer Ring Road') },
  { id: 'a5', title: 'First Light', artist: 'Sitar Trio', year: 2023, hue: 36, songs: songsOf('First Light') },
]

export const ARTISTS: DemoArtist[] = ALBUMS.map((a, i) => ({ id: `r${i + 1}`, name: a.artist, hue: a.hue + 20, album: a.id }))

export const MIXES: DemoMix[] = [
  { id: 'm1', title: 'My Supermix', subtitle: 'Indie Pune, Lo-fi Mumbai and more', hue: 228, songs: ['s1', 's2', 's17', 's5', 's8', 's10', 's13'] },
  { id: 'm2', title: 'Monsoon Mix', subtitle: 'Coastal Folk, Indie Pune', hue: 186, songs: ['s3', 's13', 's1', 's9', 's14', 's6'] },
  { id: 'm3', title: 'Night Drive', subtitle: 'Synth Bengaluru and more', hue: 300, songs: ['s4', 's11', 's7', 's16', 's2'] },
]

/** Your own playlists to start with: one with songs, one still empty. */
export const OWN_PLAYLISTS: OwnPlaylist[] = [
  { id: 'p1', title: 'Road trip', hue: 14, songs: ['s7', 's1', 's11', 's3'] },
  { id: 'p2', title: 'Late night', hue: 250, songs: [] },
]

export const songById = (id: string): DemoSong => ALL_SONGS.find((x) => x.id === id) ?? SONGS[0]
export const albumByTitle = (title: string) => ALBUMS.find((a) => a.title === title)
export const artistByName = (name: string) => ARTISTS.find((a) => a.name === name)

/** Cover art: a two-tone gradient generated from the item's hue. */
export const art = (hue: number) =>
  `radial-gradient(120% 90% at 20% 15%, hsl(${hue} 85% 62%), transparent 60%), linear-gradient(140deg, hsl(${hue} 70% 42%), hsl(${(hue + 60) % 360} 70% 22%))`

export const time = (secs: number) => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`

/** "Radio" for a song: the song, then others in its mood, then the rest. */
export function radioFor(id: string): string[] {
  const seed = songById(id)
  const same = SONGS.filter((x) => x.id !== id && x.mood === seed.mood).map((x) => x.id)
  const rest = SONGS.filter((x) => x.id !== id && x.mood !== seed.mood).map((x) => x.id)
  return [id, ...same, ...rest].slice(0, 10)
}

/** a1 b1 c1 a2 b2 c2 … */
export function interleave<T>(lists: T[][]): T[] {
  const out: T[] = []
  const longest = Math.max(0, ...lists.map((l) => l.length))
  for (let i = 0; i < longest; i++) for (const l of lists) if (i < l.length) out.push(l[i])
  return out
}

/** Songs Swar leaves out of radios and For you: skipped early twice or more. */
export const isDisliked = (skips: Record<string, number>, id: string) => (skips[id] ?? 0) >= 2

export interface ForYou {
  mix: string[]
  because: { seed: DemoSong; songs: string[] }[]
}

/**
 * Home's For you, as Swar builds it: start from a few songs you played (one
 * per artist; [round] starts somewhere else on each refresh), take what's
 * like each of them, and leave out what you just played and keep skipping.
 */
export function forYouFrom(played: string[], skips: Record<string, number>, round = 0): ForYou {
  const distinct = [...new Set(played)].filter((id) => !isDisliked(skips, id))
  if (!distinct.length) return { mix: [], because: [] }
  const rotated = distinct.map((_, i) => distinct[(i + round) % distinct.length])
  const seeds: DemoSong[] = []
  const artists = new Set<string>()
  for (const id of rotated) {
    const song = songById(id)
    if (artists.has(song.artist)) continue
    artists.add(song.artist)
    seeds.push(song)
    if (seeds.length === 3) break
  }
  const recent = new Set(played.slice(0, 2))
  const like = (seed: DemoSong) =>
    SONGS.filter((x) => x.id !== seed.id && (x.artist === seed.artist || x.mood === seed.mood))
      .map((x) => x.id)
      .filter((id) => !recent.has(id) && !isDisliked(skips, id))
  const radios = seeds.map(like)
  const mix = [...new Set(interleave(radios.map((r) => r.slice(0, 3))))].slice(0, 6)
  const because = seeds.slice(0, 2).map((seed, i) => {
    const rest = radios[i].filter((id) => !mix.includes(id))
    return { seed, songs: (rest.length >= 3 ? rest : radios[i]).slice(0, 6) }
  })
  return { mix, because: because.filter((b) => b.songs.length >= 2) }
}

// ------------------------------------------------------------ listening

/** Plays on the phone before the demo starts, as Swar's listening profile keeps them. */
export const STARTING_PLAYS: Record<string, number> = { s5: 7, s2: 5, s1: 4, s8: 3, s10: 3, s13: 2, s4: 1 }

export interface Pulse {
  listenedSecs: number
  plays: number
  songs: number
  artists: number
  /** The most played songs, most first. */
  top: string[]
  /** Artists by plays, most first. */
  rotation: string[]
}

/** Library's listening pulse: totals, On repeat and the artists in your rotation. */
export function pulseFrom(plays: Record<string, number>): Pulse {
  const played = Object.entries(plays).filter(([, n]) => n > 0)
  const byArtist = new Map<string, number>()
  let listenedSecs = 0
  for (const [id, n] of played) {
    const song = songById(id)
    listenedSecs += song.secs * n
    byArtist.set(song.artist, (byArtist.get(song.artist) ?? 0) + n)
  }
  return {
    listenedSecs,
    plays: played.reduce((sum, [, n]) => sum + n, 0),
    songs: played.length,
    artists: byArtist.size,
    top: played.sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id),
    rotation: [...byArtist.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name),
  }
}

/** "42m", "3.4h", "12h", as Library shows hours listened. */
export function hoursText(secs: number): string {
  const minutes = Math.floor(secs / 60)
  if (minutes < 60) return `${minutes}m`
  if (minutes < 600) return `${(minutes / 60).toFixed(1)}h`
  return `${Math.floor(minutes / 60)}h`
}

/** The sound signature: 40 bar heights (0 to 1) unique to your listening. */
export function signature(seed: number, bars = 40): number[] {
  return Array.from({ length: bars }, (_, i) => {
    const a = Math.sin((i + 1) * 0.37 + seed * 0.013) * 0.5 + 0.5
    const b = Math.sin((i + 3) * 1.11 + seed * 0.029) * 0.5 + 0.5
    return 0.18 + 0.82 * (a * 0.6 + b * 0.4)
  })
}

// ---------------------------------------------------------- song or video

export type Version = 'Song' | 'Video'
export type VersionMode = 'song' | 'video' | 'better'

export const VERSION_MODES: { key: VersionMode; label: string; detail: string }[] = [
  { key: 'song', label: 'Always song', detail: 'The song (album) version, like YouTube Music\'s song mode' },
  { key: 'video', label: 'Always video', detail: 'The music video\'s audio when there is one, with the song\'s cover' },
  { key: 'better', label: 'Better quality', detail: 'Whichever version has the better audio; the video\'s is sometimes higher, often on free accounts' },
]

/** Which version plays first: the video only when its audio is clearly better (8 kbps or more). */
export function versionFor(song: DemoSong, mode: VersionMode): Version {
  if (!song.video || mode === 'song') return 'Song'
  if (mode === 'video') return 'Video'
  return song.video.video >= song.video.song + 8 ? 'Video' : 'Song'
}

// ---------------------------------------------------------------- storage

const MB = 1024 * 1024
export const CACHE_LIMITS = [128, 256, 512, 1024, 2048, 4096, 8192].map((m) => m * MB)
export const DEFAULT_CACHE = 512 * MB
/** The demo phone's free space: the two biggest sizes don't fit. */
export const FREE_BYTES = 3.1 * 1024 * MB

export function sizeText(bytes: number): string {
  if (bytes >= 1024 * MB) return `${+(bytes / 1024 / MB).toFixed(1)} GB`
  return `${Math.round(bytes / MB)} MB`
}
