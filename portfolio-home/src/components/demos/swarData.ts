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

export type Mood = 'Relax' | 'Focus' | 'Workout' | 'Romance'
export const MOODS: Mood[] = ['Relax', 'Focus', 'Workout', 'Romance']

const s = (id: string, title: string, artist: string, album: string, secs: number, hue: number, mood: Mood): DemoSong => ({
  id, title, artist, album, secs, hue, mood,
})

export const SONGS: DemoSong[] = [
  s('s1', 'Monsoon Drive', 'Indie Pune', 'Western Ghats', 214, 196, 'Relax'),
  s('s2', 'Late Train Home', 'Lo-fi Mumbai', 'Platform 7', 187, 262, 'Focus'),
  s('s3', 'Konkan Coast', 'Coastal Folk', 'Salt & Sand', 241, 172, 'Relax'),
  s('s4', 'Night Shift', 'Synth Bengaluru', 'Outer Ring Road', 205, 290, 'Workout'),
  s('s5', 'Morning Raga', 'Sitar Trio', 'First Light', 263, 38, 'Focus'),
  s('s6', 'Chai at Dawn', 'Lo-fi Mumbai', 'Platform 7', 172, 24, 'Relax'),
  s('s7', 'Sahyadri Run', 'Synth Bengaluru', 'Outer Ring Road', 198, 330, 'Workout'),
  s('s8', 'Paper Boats', 'Indie Pune', 'Western Ghats', 226, 210, 'Romance'),
  s('s9', 'Tide Tables', 'Coastal Folk', 'Salt & Sand', 233, 150, 'Romance'),
  s('s10', 'Local at 9:12', 'Lo-fi Mumbai', 'Platform 7', 181, 280, 'Focus'),
  s('s11', 'Neon Silk Board', 'Synth Bengaluru', 'Outer Ring Road', 219, 316, 'Workout'),
  s('s12', 'Brass Lamp', 'Sitar Trio', 'First Light', 247, 46, 'Romance'),
  s('s13', 'Rain on Tin', 'Indie Pune', 'Western Ghats', 193, 188, 'Relax'),
  s('s14', 'Fishing Nets', 'Coastal Folk', 'Salt & Sand', 208, 164, 'Relax'),
  s('s15', 'Third Taal', 'Sitar Trio', 'First Light', 271, 30, 'Focus'),
  s('s16', 'Overpass', 'Synth Bengaluru', 'Outer Ring Road', 202, 300, 'Workout'),
]

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
  { id: 'm1', title: 'My Supermix', subtitle: 'Indie Pune, Lo-fi Mumbai and more', hue: 228, songs: ['s1', 's2', 's5', 's8', 's10', 's13'] },
  { id: 'm2', title: 'Monsoon Mix', subtitle: 'Coastal Folk, Indie Pune', hue: 186, songs: ['s3', 's13', 's1', 's9', 's14', 's6'] },
  { id: 'm3', title: 'Night Drive', subtitle: 'Synth Bengaluru and more', hue: 300, songs: ['s4', 's11', 's7', 's16', 's2'] },
]

export const songById = (id: string): DemoSong => SONGS.find((x) => x.id === id) ?? SONGS[0]
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
