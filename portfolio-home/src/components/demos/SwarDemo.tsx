import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { useInView } from '../../hooks/motion'
import {
  ALBUMS,
  ARTISTS,
  MIXES,
  MOODS,
  SONGS,
  albumByTitle,
  art,
  artistByName,
  forYouFrom,
  isDisliked,
  radioFor,
  songById,
  time,
  type DemoSong,
  type DlGroup,
  type Mood,
} from './swarData'

type Tab = 'home' | 'search' | 'library'
type Repeat = 'off' | 'all' | 'one'
type Filter = 'All' | 'Songs' | 'Albums' | 'Artists'
type Quality = 'Auto' | 'High' | 'Normal' | 'Low'
type Sheet = 'queue' | 'quality' | null
type Page =
  | { kind: 'album'; id: string }
  | { kind: 'artist'; id: string }
  | { kind: 'mix'; id: string }
  | { kind: 'liked' }
  | { kind: 'history' }
  | { kind: 'downloads' }
  | { kind: 'dlgroup'; key: string }
  | { kind: 'shelf'; shelf: 'Playlists' | 'Albums' | 'Artists' }

const QUALITY: Record<Quality, { detail: string; label: string }> = {
  Auto: { detail: 'High on Wi-Fi, Normal on mobile data', label: 'Opus · 131 kbps' },
  High: { detail: 'The best audio on offer for each song', label: 'Opus · 131 kbps' },
  Normal: { detail: 'Up to about 128 kbps', label: 'AAC · 128 kbps' },
  Low: { detail: 'Saves data', label: 'AAC · 48 kbps' },
}

// ------------------------------------------------------------------ icons

const PATHS = {
  play: 'M8 5.5v13l10.5-6.5z',
  pause: 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z',
  next: 'M6 6l8.5 6L6 18zM16 6h2v12h-2z',
  prev: 'M18 6L9.5 12 18 18zM6 6h2v12H6z',
  shuffle: 'M4 7h3.5l9 10H20M4 17h3.5l2.6-2.9M13.9 9.9L16.5 7H20M17.5 4.5L20 7l-2.5 2.5M17.5 14.5L20 17l-2.5 2.5',
  repeat: 'M5 11V9a2 2 0 0 1 2-2h11M15.5 4.5L18 7l-2.5 2.5M19 13v2a2 2 0 0 1-2 2H6M8.5 19.5L6 17l2.5-2.5',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  home: 'M4 11l8-6.5 8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z',
  search: 'M10.5 4.5a6 6 0 1 1 0 12 6 6 0 0 1 0-12zM15 15l4.5 4.5',
  library: 'M5 4.5v15M9 4.5v15M13 5l5 14',
  down: 'M6 9.5l6 6 6-6',
  back: 'M15 5.5L8.5 12 15 18.5',
  queue: 'M4 6.5h12M4 11h12M4 15.5h7M15 14.5v5l4-2.5z',
  more: 'M12 6.2v.1M12 12v.1M12 17.8v.1',
  close: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
  eq: 'M5 10v4M9 7v10M13 4.5v15M17 8v8M21 10.5v3',
  plus: 'M12 5v14M5 12h14',
  radio: 'M5.5 9h13a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zM7 9l9-4.5M15.5 14a1.5 1.5 0 1 0 0 .1',
  album: 'M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16zM12 10.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z',
  person: 'M12 4.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM5 19.5c.8-3.4 3.6-5 7-5s6.2 1.6 7 5',
  history: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v3.5H8M12 8v4.5l3 2',
  download: 'M12 4.5v10M7.5 10.5L12 15l4.5-4.5M5.5 19.5h13',
  done: 'M5.5 12.5l4 4L18.5 7.5',
  refresh: 'M19 12a7 7 0 1 1-2.1-5M19 4.5V8h-3.5',
} as const
type IconName = keyof typeof PATHS
const FILLED: IconName[] = ['play', 'pause', 'next', 'prev']

function Icon({ name, size = 20, filled }: { name: IconName; size?: number; filled?: boolean }) {
  const fill = filled ?? FILLED.includes(name)
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className="sd-icon">
      <path
        d={PATHS[name]}
        fill={fill ? 'currentColor' : 'none'}
        stroke={fill ? 'none' : 'currentColor'}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Art({ hue, round, children, className = '' }: { hue: number; round?: boolean; children?: ReactNode; className?: string }) {
  return (
    <span className={`sd-art${round ? ' round' : ''} ${className}`} style={{ background: art(hue) }} aria-hidden="true">
      {children}
    </span>
  )
}

// ------------------------------------------------------------------ demo

/**
 * Swar's screens, working, on made-up music: browse Home, search, open an
 * album, play, then swipe the player up and down like on the phone. Nothing
 * plays out loud; progress is simulated.
 */
export default function SwarDemo({ reduced }: { reduced: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  const visible = useInView(root, '0px')

  const [tab, setTab] = useState<Tab>('home')
  const [pages, setPages] = useState<Page[]>([])
  const [mood, setMood] = useState<Mood | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('All')

  const [queue, setQueue] = useState<string[]>([])
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0)
  const [shuffle, setShuffle] = useState(false)
  const [repeat, setRepeat] = useState<Repeat>('off')
  const [liked, setLiked] = useState<Set<string>>(() => new Set(['s3', 's8']))
  const [history, setHistory] = useState<string[]>(['s5', 's2'])
  const [quality, setQuality] = useState<Quality>('Auto')
  /** Early skips per song: two or more and Swar leaves it out of radios and For you. */
  const [skips, setSkips] = useState<Record<string, number>>({})
  const [round, setRound] = useState(0)
  /** Download progress per song, 0 to 100. */
  const [downloads, setDownloads] = useState<Record<string, number>>({ s6: 100 })
  /** An album's or playlist's download being asked about (cancel or remove). */
  const [asking, setAsking] = useState<{ ids: string[]; what: string } | null>(null)
  /** Albums and playlists downloaded as a whole: kept together in Downloads. */
  const [groups, setGroups] = useState<Record<string, DlGroup>>({})

  const [expand, setExpand] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [menu, setMenu] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const current = queue.length ? songById(queue[index]) : null
  const page = pages[pages.length - 1] ?? null

  const say = useCallback((text: string) => setToast(text), [])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 1800)
    return () => clearTimeout(t)
  }, [toast])

  // ---------------------------------------------------------------- playback

  const playList = useCallback((ids: string[], start = 0, shuffled = false) => {
    if (!ids.length) return
    let list = ids
    if (shuffled) {
      list = [...ids].sort(() => Math.random() - 0.5)
      start = 0
    }
    setQueue(list)
    setIndex(start)
    setPos(0)
    setPlaying(true)
    setShuffle(shuffled)
    setHistory((h) => [list[start], ...h.filter((x) => x !== list[start])].slice(0, 12))
  }, [])

  const playRadio = useCallback(
    (id: string) => playList(radioFor(id).filter((x) => x === id || !isDisliked(skips, x))),
    [playList, skips],
  )

  const goTo = useCallback(
    (i: number) => {
      setIndex(i)
      setPos(0)
      setPlaying(true)
      setHistory((h) => [queue[i], ...h.filter((x) => x !== queue[i])].slice(0, 12))
    },
    [queue],
  )

  const next = useCallback(() => {
    if (index < queue.length - 1) goTo(index + 1)
    else if (repeat === 'all' && queue.length) goTo(0)
    else setPlaying(false)
  }, [index, queue.length, repeat, goTo])

  /** Next from the buttons: moving on in the first 20 s counts as a skip. */
  const skipNext = () => {
    if (current && pos < 20) setSkips((k) => ({ ...k, [current.id]: (k[current.id] ?? 0) + 1 }))
    next()
  }

  /** The mini player's previous: always the song before (or the start of the first). */
  const prevSong = () => {
    if (index === 0) setPos(0)
    else goTo(index - 1)
  }

  const prev = () => {
    if (pos > 3 || index === 0) setPos(0)
    else goTo(index - 1)
  }

  // Simulated progress, only while the demo is on screen. The timer calls the
  // latest tick, which moves on to the next song at the end of this one.
  const tick = useRef<() => void>(() => {})
  useEffect(() => {
    tick.current = () => {
      if (!current) return
      if (pos + 1 < current.secs) setPos(pos + 1)
      else if (repeat === 'one') setPos(0)
      else next()
    }
  })
  useEffect(() => {
    if (!playing || !visible || !current) return
    const t = setInterval(() => tick.current(), 1000)
    return () => clearInterval(t)
  }, [playing, visible, current])

  const toggleShuffle = () => {
    if (!shuffle && queue.length > index + 1) {
      const rest = queue.slice(index + 1).sort(() => Math.random() - 0.5)
      setQueue([...queue.slice(0, index + 1), ...rest])
    }
    setShuffle(!shuffle)
  }

  const playNext = (id: string) => {
    if (!queue.length) return playRadio(id)
    setQueue((q) => [...q.slice(0, index + 1), id, ...q.slice(index + 1).filter((x) => x !== id)])
    say(`Playing next: ${songById(id).title}`)
  }
  const addToQueue = (id: string) => {
    if (!queue.length) return playRadio(id)
    setQueue((q) => [...q.filter((x, i) => x !== id || i <= index), id])
    say(`Added to queue: ${songById(id).title}`)
  }
  const removeAt = (i: number) => {
    if (i === index) return
    setQueue((q) => q.filter((_, j) => j !== i))
    if (i < index) setIndex((x) => x - 1)
  }
  // ------------------------------------------------------------- downloads

  const downloadAll = (ids: string[], group?: DlGroup) => {
    if (group) setGroups((g) => ({ ...g, [group.key]: group }))
    const fresh = ids.filter((id) => downloads[id] === undefined)
    if (!fresh.length) return
    setDownloads((d) => ({ ...d, ...Object.fromEntries(fresh.map((id) => [id, reduced ? 100 : 0])) }))
    say(fresh.length === 1 ? `Downloading ${songById(fresh[0]).title}` : `Downloading ${fresh.length} songs`)
  }
  const removeDownload = (id: string) =>
    setDownloads((d) => {
      const n = { ...d }
      delete n[id]
      return n
    })
  const isDownloaded = (id: string) => downloads[id] === 100
  const pending = Object.keys(downloads).filter((id) => downloads[id] < 100)

  // Simulated download progress, one song at a time, while on screen.
  useEffect(() => {
    if (!pending.length || !visible) return
    const t = setInterval(() => {
      setDownloads((d) => {
        const id = Object.keys(d).find((x) => d[x] < 100)
        return id ? { ...d, [id]: Math.min(100, d[id] + 20) } : d
      })
    }, 300)
    return () => clearInterval(t)
  }, [pending.length, visible])

  /** Album or playlist download, an icon: download, a progress ring with a cross, a tick. */
  const pageDownload = (ids: string[], group: DlGroup) => {
    const what = group.isAlbum ? 'album' : 'playlist'
    const done = ids.filter(isDownloaded).length
    const left = ids.filter((id) => downloads[id] !== undefined && downloads[id] < 100).length
    if (left > 0) {
      const progress = ids.reduce((sum, id) => sum + (downloads[id] ?? 0), 0) / ids.length
      return (
        <button
          type="button"
          className="sd-iconbtn sd-round"
          onClick={() => setAsking({ ids, what })}
          aria-label={`Downloading ${done} of ${ids.length}. Cancel`}
        >
          <i className="sd-ring" style={{ '--p': `${progress}%` } as React.CSSProperties} />
          <span className="sd-ring-x">
            <Icon name="close" size={11} />
          </span>
        </button>
      )
    }
    if (done === ids.length) {
      return (
        <button type="button" className="sd-iconbtn sd-round lit" onClick={() => setAsking({ ids, what })} aria-label="Downloaded. Remove">
          <Icon name="done" size={18} />
        </button>
      )
    }
    return (
      <button
        type="button"
        className="sd-iconbtn sd-round lit"
        onClick={() => downloadAll(ids, { ...group, ids })}
        aria-label={done > 0 ? `Download the other ${ids.length - done}` : 'Download all'}
      >
        <Icon name="download" size={18} />
      </button>
    )
  }

  const toggleLike = (id: string) =>
    setLiked((l) => {
      const n = new Set(l)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  // -------------------------------------------------------------- navigation

  const open = (p: Page) => {
    setPages((s) => [...s, p])
    setExpand(0)
  }
  const back = () => setPages((s) => s.slice(0, -1))
  const switchTab = (t: Tab) => {
    setTab(t)
    setPages([])
  }

  // ----------------------------------------------------- the player gesture

  const drag = useRef<{
    x0: number
    y0: number
    from: number
    last: number
    t: number
    v: number
    moved: boolean
    /** Sideways on the mini player: next or previous song. */
    sideways: boolean
    dx: number
  } | null>(null)
  const [swipe, setSwipe] = useState(0)
  const justDragged = useRef(false)

  // The drag is followed on the whole document, so it keeps going when the
  // pointer leaves the mini player, without capturing taps meant for buttons.
  const onDown = (e: ReactPointerEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('input, [data-nodrag]')) return
    const screen = root.current?.querySelector<HTMLElement>('.sd-screen')
    if (!screen) return
    const onMini = expand === 0 && !!(e.target as HTMLElement).closest('.sd-mini')
    drag.current = { x0: e.clientX, y0: e.clientY, from: expand, last: e.clientY, t: performance.now(), v: 0, moved: false, sideways: false, dx: 0 }
    const move = (ev: PointerEvent) => {
      const d = drag.current
      if (!d) return
      const dy = ev.clientY - d.y0
      const dx = ev.clientX - d.x0
      if (!d.moved) {
        if (Math.abs(dy) < 6 && Math.abs(dx) < 6) return
        d.moved = true
        d.sideways = onMini && Math.abs(dx) > Math.abs(dy)
        if (!d.sideways) setDragging(true)
      }
      ev.preventDefault()
      if (d.sideways) {
        d.dx = dx
        setSwipe(dx)
        return
      }
      const now = performance.now()
      if (now > d.t) d.v = (ev.clientY - d.last) / (now - d.t)
      d.last = ev.clientY
      d.t = now
      setExpand(Math.min(1, Math.max(0, d.from - dy / screen.clientHeight)))
    }
    const up = () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      document.removeEventListener('pointercancel', up)
      const d = drag.current
      drag.current = null
      if (!d?.moved) return
      justDragged.current = true
      setTimeout(() => (justDragged.current = false), 0)
      if (d.sideways) {
        setSwipe(0)
        if (d.dx < -60) skipNext()
        else if (d.dx > 60) prevSong()
        return
      }
      setDragging(false)
      setExpand((x) => (d.v < -0.4 ? 1 : d.v > 0.4 ? 0 : x > 0.5 ? 1 : 0))
    }
    document.addEventListener('pointermove', move, { passive: false })
    document.addEventListener('pointerup', up)
    document.addEventListener('pointercancel', up)
  }
  const gesture = { onPointerDown: onDown }

  // ------------------------------------------------------------------ views

  const isCurrent = (id: string) => current?.id === id

  const songRow = (song: DemoSong, opts: { list?: string[]; i?: number; numbered?: boolean } = {}) => {
    const { list, i, numbered } = opts
    return (
    <div key={`${song.id}-${i ?? ''}`} className={`sd-row${isCurrent(song.id) ? ' on' : ''}`}>
      <button
        type="button"
        className="sd-row-main"
        onClick={() => (list ? playList(list, i ?? 0) : playRadio(song.id))}
        aria-label={`Play ${song.title} by ${song.artist}`}
      >
        {numbered ? (
          <span className="sd-num">{isCurrent(song.id) ? <Bars playing={playing} /> : (i ?? 0) + 1}</span>
        ) : (
          <Art hue={song.hue}>{isCurrent(song.id) && <Bars playing={playing} />}</Art>
        )}
        <span className="sd-row-text">
          <span className="sd-row-title">{song.title}</span>
          <span className="sd-row-sub">
            {isDownloaded(song.id) && (
              <span className="sd-tick" title="Downloaded">
                <Icon name="done" size={12} />
              </span>
            )}
            {numbered ? time(song.secs) : `${song.artist} • ${song.album}`}
          </span>
        </span>
      </button>
      <button type="button" className="sd-iconbtn" onClick={() => setMenu(song.id)} aria-label={`More for ${song.title}`}>
        <Icon name="more" />
      </button>
    </div>
    )
  }

  const card = (key: string, title: string, sub: string, hue: number, onClick: () => void, round = false) => (
    <button key={key} type="button" className={`sd-card${round ? ' round' : ''}`} onClick={onClick}>
      <Art hue={hue} round={round} />
      <span className="sd-card-title">{title}</span>
      <span className="sd-card-sub">{sub}</span>
    </button>
  )

  const quickPicks = useMemo(() => (mood ? SONGS.filter((x) => x.mood === mood) : SONGS).slice(0, 4), [mood])
  const forYou = useMemo(() => forYouFrom(history, skips, round), [history, skips, round])

  const home = (
    <>
      <div className="sd-wordmark">SWAR</div>
      <div className="sd-chips" role="group" aria-label="Moods">
        {MOODS.map((m) => (
          <button key={m} type="button" className={`sd-chip${mood === m ? ' on' : ''}`} onClick={() => setMood(mood === m ? null : m)} aria-pressed={mood === m}>
            {m}
          </button>
        ))}
      </div>
      {!mood && forYou.mix.length > 0 && (
        <>
          <p className="sd-strap">Made from what you play</p>
          <div className="sd-h sd-h-row">
            <h4>Your mix</h4>
            <button type="button" className="sd-iconbtn" onClick={() => setRound((r) => r + 1)} aria-label="New mix">
              <Icon name="refresh" size={18} />
            </button>
          </div>
          {forYou.mix.slice(0, 4).map((id) => songRow(songById(id)))}
          {forYou.because.map(({ seed, songs }) => (
            <div key={seed.id}>
              <p className="sd-strap">Because you played</p>
              <h4 className="sd-h">{seed.title}</h4>
              <div className="sd-carousel">
                {songs.map((id) => {
                  const x = songById(id)
                  return card(`b-${seed.id}-${id}`, x.title, x.artist, x.hue, () => playRadio(id))
                })}
              </div>
            </div>
          ))}
        </>
      )}
      <p className="sd-strap">Start radio from a song</p>
      <h4 className="sd-h">Quick picks</h4>
      {quickPicks.map((x) => songRow(x))}
      <h4 className="sd-h">Albums for you</h4>
      <div className="sd-carousel">
        {ALBUMS.map((a) => card(a.id, a.title, `Album • ${a.artist}`, a.hue, () => open({ kind: 'album', id: a.id })))}
      </div>
      <h4 className="sd-h">Mixed for you</h4>
      <div className="sd-carousel">
        {MIXES.map((m) => card(m.id, m.title, m.subtitle, m.hue, () => playList(m.songs)))}
      </div>
      <h4 className="sd-h">Artists you might like</h4>
      <div className="sd-carousel">
        {ARTISTS.map((r) => card(r.id, r.name, 'Artist', r.hue, () => open({ kind: 'artist', id: r.id }), true))}
      </div>
    </>
  )

  const q = query.trim().toLowerCase()
  const found = {
    songs: q ? SONGS.filter((x) => `${x.title} ${x.artist} ${x.album}`.toLowerCase().includes(q)) : [],
    albums: q ? ALBUMS.filter((a) => `${a.title} ${a.artist}`.toLowerCase().includes(q)) : [],
    artists: q ? ARTISTS.filter((r) => r.name.toLowerCase().includes(q)) : [],
  }
  const nothing = !found.songs.length && !found.albums.length && !found.artists.length

  const search = (
    <>
      <label className="sd-search">
        <Icon name="search" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Songs, artists, albums…"
          aria-label="Search the demo catalogue"
        />
        {query && (
          <button type="button" className="sd-iconbtn" onClick={() => setQuery('')} aria-label="Clear search">
            <Icon name="close" size={16} />
          </button>
        )}
      </label>
      {!q ? (
        <>
          <p className="sd-strap">Recent searches</p>
          {['lo-fi', 'coastal', 'synth'].map((r) => (
            <button key={r} type="button" className="sd-recent" onClick={() => setQuery(r)}>
              <Icon name="history" size={16} />
              {r}
            </button>
          ))}
        </>
      ) : (
        <>
          <div className="sd-chips" role="group" aria-label="Filter results">
            {(['All', 'Songs', 'Albums', 'Artists'] as Filter[]).map((f) => (
              <button key={f} type="button" className={`sd-chip${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)} aria-pressed={filter === f}>
                {f}
              </button>
            ))}
          </div>
          {nothing && <p className="sd-empty">No results for “{query}”. Try “mumbai” or “raga”.</p>}
          {(filter === 'All' || filter === 'Artists') &&
            found.artists.map((r) => (
              <button key={r.id} type="button" className="sd-row-main sd-listitem" onClick={() => open({ kind: 'artist', id: r.id })}>
                <Art hue={r.hue} round />
                <span className="sd-row-text">
                  <span className="sd-row-title">{r.name}</span>
                  <span className="sd-row-sub">Artist</span>
                </span>
              </button>
            ))}
          {(filter === 'All' || filter === 'Songs') && found.songs.map((x) => songRow(x))}
          {(filter === 'All' || filter === 'Albums') &&
            found.albums.map((a) => (
              <button key={a.id} type="button" className="sd-row-main sd-listitem" onClick={() => open({ kind: 'album', id: a.id })}>
                <Art hue={a.hue} />
                <span className="sd-row-text">
                  <span className="sd-row-title">{a.title}</span>
                  <span className="sd-row-sub">Album • {a.artist}</span>
                </span>
              </button>
            ))}
        </>
      )}
    </>
  )

  const library = (
    <>
      <h3 className="sd-title">Library</h3>
      <div className="sd-account">
        <Art hue={20} round />
        <span>
          <strong>Demo listener</strong>
          <small>Signed in · YouTube Music</small>
        </span>
      </div>
      {(
        [
          ['heart', 'Liked songs', () => open({ kind: 'liked' })],
          ['queue', 'Playlists', () => open({ kind: 'shelf', shelf: 'Playlists' })],
          ['album', 'Albums', () => open({ kind: 'shelf', shelf: 'Albums' })],
          ['person', 'Artists', () => open({ kind: 'shelf', shelf: 'Artists' })],
          ['history', 'History', () => open({ kind: 'history' })],
          ['download', 'Downloads', () => open({ kind: 'downloads' })],
        ] as [IconName, string, () => void][]
      ).map(([icon, label, go]) => (
        <button key={label} type="button" className="sd-tile" onClick={go}>
          <Icon name={icon} filled={icon === 'heart'} />
          {label}
          {label === 'Liked songs' && <small>{liked.size}</small>}
          {label === 'Downloads' && <small>{Object.keys(downloads).length - pending.length}</small>}
        </button>
      ))}
    </>
  )

  const songPage = (
    title: string,
    sub: string,
    hue: number,
    ids: string[],
    opts: {
      numbered?: boolean
      round?: boolean
      empty?: string
      download?: DlGroup
      /** What plays: these songs, then (for a downloaded album) the rest. */
      queue?: (shuffled: boolean) => string[]
    },
  ) => (
    <>
      <div className={`sd-pagehead${opts.round ? ' artist' : ''}`}>
        <Art hue={hue} round={opts.round} className="big" />
        <h3>{title}</h3>
        <p>{sub}</p>
        {ids.length > 0 && (
          <div className="sd-actions">
            <button type="button" className="sd-primary" onClick={() => (opts.queue ? playList(opts.queue(false)) : playList(ids))}>
              <Icon name="play" size={16} /> Play
            </button>
            <button type="button" className="sd-ghost" onClick={() => (opts.queue ? playList(opts.queue(true)) : playList(ids, 0, true))}>
              <Icon name="shuffle" size={16} /> Shuffle
            </button>
            {opts.download && pageDownload(ids, opts.download)}
          </div>
        )}
      </div>
      {ids.length === 0 && opts.empty && <p className="sd-empty">{opts.empty}</p>}
      {ids.map((id, i) => songRow(songById(id), { list: opts.queue ? opts.queue(false) : ids, i, numbered: opts.numbered }))}
    </>
  )

  let pageView: ReactNode = null
  if (page?.kind === 'album') {
    const a = ALBUMS.find((x) => x.id === page.id) ?? ALBUMS[0]
    pageView = songPage(a.title, `Album • ${a.artist} • ${a.year} • ${a.songs.length} songs`, a.hue, a.songs, {
      numbered: true,
      download: { key: a.id, title: a.title, hue: a.hue, isAlbum: true, ids: a.songs },
    })
  } else if (page?.kind === 'artist') {
    const r = ARTISTS.find((x) => x.id === page.id) ?? ARTISTS[0]
    const ids = SONGS.filter((x) => x.artist === r.name).map((x) => x.id)
    pageView = songPage(r.name, 'Artist • Top songs', r.hue, ids, { round: true })
  } else if (page?.kind === 'mix') {
    const m = MIXES.find((x) => x.id === page.id) ?? MIXES[0]
    pageView = songPage(m.title, m.subtitle, m.hue, m.songs, {
      download: { key: m.id, title: m.title, hue: m.hue, isAlbum: false, ids: m.songs },
    })
  } else if (page?.kind === 'liked') {
    pageView = songPage('Liked songs', `${liked.size} songs`, 330, [...liked], { empty: 'Tap ♡ in the player to like a song.' })
  } else if (page?.kind === 'history') {
    pageView = songPage('History', 'Played in this demo', 210, history, {})
  } else if (page?.kind === 'downloads') {
    const done = Object.keys(downloads).filter(isDownloaded)
    const shown = Object.values(groups).filter((g) => g.ids.some((id) => downloads[id] !== undefined))
    const grouped = new Set(shown.flatMap((g) => g.ids))
    const singles = done.filter((id) => !grouped.has(id))
    const loose = pending.filter((id) => !grouped.has(id))
    pageView = (
      <>
        {songPage('Downloads', `${done.length} songs · play offline`, 190, [], {
          empty: done.length || pending.length ? '' : 'Long-press a song or open an album and tap the download button.',
        })}
        {done.length > 0 && (
          <div className="sd-actions">
            <button type="button" className="sd-primary" onClick={() => playList(done)}>
              <Icon name="play" size={16} /> Play
            </button>
            <button type="button" className="sd-ghost" onClick={() => playList(done, 0, true)}>
              <Icon name="shuffle" size={16} /> Shuffle
            </button>
          </div>
        )}
        {shown.length > 0 && <p className="sd-strap">Albums & playlists</p>}
        {shown.map((g) => {
          const have = g.ids.filter(isDownloaded).length
          const left = g.ids.length - have
          return (
            <button key={g.key} type="button" className="sd-row-main sd-listitem" onClick={() => open({ kind: 'dlgroup', key: g.key })}>
              <Art hue={g.hue} />
              <span className="sd-row-text">
                <span className="sd-row-title">{g.title}</span>
                <span className="sd-row-sub">
                  {g.isAlbum ? 'Album' : 'Playlist'} • {have} songs{left > 0 ? ` • ${left} downloading` : ''}
                </span>
              </span>
            </button>
          )
        })}
        {loose.length > 0 && <p className="sd-strap">In progress</p>}
        {loose.map((id) => {
          const x = songById(id)
          return (
            <div key={id} className="sd-row">
              <span className="sd-row-main">
                <Art hue={x.hue} />
                <span className="sd-row-text">
                  <span className="sd-row-title">{x.title}</span>
                  <span className="sd-row-sub">Downloading · {downloads[id]}%</span>
                  <i className="sd-dl-bar" style={{ width: `${downloads[id]}%` }} />
                </span>
              </span>
              <button type="button" className="sd-iconbtn" onClick={() => removeDownload(id)} aria-label={`Cancel ${x.title}`}>
                <Icon name="close" size={16} />
              </button>
            </div>
          )
        })}
        {singles.length > 0 && <p className="sd-strap">Songs</p>}
        {singles.map((id, i) => songRow(songById(id), { list: singles, i }))}
      </>
    )
  } else if (page?.kind === 'dlgroup') {
    const g = groups[page.key]
    const ids = g ? g.ids.filter(isDownloaded) : []
    // The album or playlist, then the rest of the downloads, shuffled.
    const queue = (shuffled: boolean) => {
      const rest = Object.keys(downloads).filter((id) => isDownloaded(id) && !ids.includes(id))
      const mix = (l: string[]) => [...l].sort(() => Math.random() - 0.5)
      return [...(shuffled ? mix(ids) : ids), ...mix(rest)]
    }
    pageView = g
      ? songPage(g.title, `${g.isAlbum ? 'Album' : 'Playlist'} • ${ids.length} songs • downloaded`, g.hue, ids, {
          numbered: g.isAlbum,
          empty: 'Not downloaded any more.',
          queue,
        })
      : null
  } else if (page?.kind === 'shelf') {
    const items =
      page.shelf === 'Playlists'
        ? MIXES.map((m) => ({ key: m.id, title: m.title, sub: m.subtitle, hue: m.hue, round: false, go: () => open({ kind: 'mix', id: m.id }) }))
        : page.shelf === 'Albums'
          ? ALBUMS.map((a) => ({ key: a.id, title: a.title, sub: a.artist, hue: a.hue, round: false, go: () => open({ kind: 'album', id: a.id }) }))
          : ARTISTS.map((r) => ({ key: r.id, title: r.name, sub: 'Artist', hue: r.hue, round: true, go: () => open({ kind: 'artist', id: r.id }) }))
    pageView = (
      <>
        <h3 className="sd-title">{page.shelf}</h3>
        <div className="sd-grid">
          {items.map((it) => card(it.key, it.title, it.sub, it.hue, it.go, it.round))}
        </div>
      </>
    )
  }

  const menuSong = menu ? songById(menu) : null
  const closeAll = () => {
    setMenu(null)
    setSheet(null)
  }

  const motion = reduced || dragging ? 'none' : undefined

  return (
    <div
      ref={root}
      className="sd"
      role="region"
      aria-label="Swar, interactive demo with made-up music"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          if (asking) setAsking(null)
          else if (menu || sheet) closeAll()
          else if (expand > 0) setExpand(0)
        }
      }}
    >
      <div className="sd-phone">
        <div className="sd-screen">
          <div className="sd-status" aria-hidden="true">
            <span>9:41</span>
            <span>5G · 86%</span>
          </div>

          <div className="sd-scroll" key={`${tab}-${pages.length}`}>
            {page && (
              <button type="button" className="sd-back" onClick={back} aria-label="Back">
                <Icon name="back" />
              </button>
            )}
            {page ? pageView : tab === 'home' ? home : tab === 'search' ? search : library}
          </div>

          {/* Mini player above the tabs */}
          {current && (
            <div
              className="sd-mini"
              style={{ opacity: 1 - expand, transition: motion }}
              {...gesture}
              onClick={(e) => {
                if (!justDragged.current && !(e.target as HTMLElement).closest('button')) setExpand(1)
              }}
              role="button"
              tabIndex={0}
              aria-label={`Open the player: ${current.title}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.target === e.currentTarget) setExpand(1)
              }}
            >
              <span
                className="sd-mini-song"
                style={{ transform: `translateX(${swipe}px)`, opacity: 1 - Math.min(0.7, Math.abs(swipe) / 260), transition: swipe ? 'none' : undefined }}
              >
                <Art hue={current.hue} />
                <span className="sd-row-text">
                  <span className="sd-row-title">{current.title}</span>
                  <span className="sd-row-sub">{current.artist}</span>
                </span>
              </span>
              <button type="button" className="sd-iconbtn" onClick={prevSong} aria-label="Previous">
                <Icon name="prev" />
              </button>
              <button type="button" className="sd-play small" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'}>
                <Icon name={playing ? 'pause' : 'play'} size={18} />
              </button>
              <button type="button" className="sd-iconbtn" onClick={skipNext} aria-label="Next">
                <Icon name="next" />
              </button>
              <i className="sd-mini-progress" style={{ width: `${(pos / current.secs) * 100}%` }} />
            </div>
          )}

          <nav className="sd-tabs" aria-label="Demo tabs">
            {(
              [
                ['home', 'Home', 'home'],
                ['search', 'Search', 'search'],
                ['library', 'Library', 'library'],
              ] as [Tab, string, IconName][]
            ).map(([t, label, icon]) => (
              <button key={t} type="button" className={tab === t ? 'on' : ''} onClick={() => switchTab(t)} aria-current={tab === t ? 'page' : undefined}>
                <Icon name={icon} />
                <span>{label}</span>
              </button>
            ))}
          </nav>

          {/* Full player, sliding over everything and following the finger */}
          {current && (
            <div
              className="sd-player"
              style={
                {
                  transform: `translateY(${(1 - expand) * 100}%)`,
                  transition: motion,
                  visibility: expand === 0 && !dragging ? 'hidden' : 'visible',
                  '--glow': `${current.hue}`,
                } as React.CSSProperties
              }
              aria-hidden={expand === 0}
              {...gesture}
            >
              <div className="sd-player-top">
                <button type="button" className="sd-iconbtn" onClick={() => setExpand(0)} aria-label="Close the player">
                  <Icon name="down" size={24} />
                </button>
                <span className="sd-player-label">
                  <i />
                  NOW PLAYING
                </span>
                <button type="button" className="sd-iconbtn" onClick={() => setMenu(current.id)} aria-label="More">
                  <Icon name="more" />
                </button>
              </div>
              <Art hue={current.hue} className="cover" />
              <div className="sd-player-meta">
                <span>
                  <strong>{current.title}</strong>
                  <button
                    type="button"
                    className="sd-link"
                    onClick={() => {
                      const r = artistByName(current.artist)
                      if (r) {
                        setTab('home')
                        setPages([{ kind: 'artist', id: r.id }])
                        setExpand(0)
                      }
                    }}
                  >
                    {current.artist}
                  </button>
                </span>
                <button
                  type="button"
                  className={`sd-iconbtn${isDownloaded(current.id) ? ' lit' : ''}`}
                  onClick={() => (downloads[current.id] === undefined ? downloadAll([current.id]) : removeDownload(current.id))}
                  aria-label={
                    downloads[current.id] === undefined ? 'Download' : isDownloaded(current.id) ? 'Remove download' : 'Cancel download'
                  }
                  data-nodrag
                >
                  {downloads[current.id] !== undefined && !isDownloaded(current.id) ? (
                    <i className="sd-ring" style={{ '--p': `${downloads[current.id]}%` } as React.CSSProperties} />
                  ) : (
                    <Icon name={isDownloaded(current.id) ? 'done' : 'download'} size={22} />
                  )}
                </button>
                <button
                  type="button"
                  className={`sd-iconbtn${liked.has(current.id) ? ' liked' : ''}`}
                  onClick={() => toggleLike(current.id)}
                  aria-label={liked.has(current.id) ? 'Unlike' : 'Like'}
                  aria-pressed={liked.has(current.id)}
                >
                  <Icon name="heart" filled={liked.has(current.id)} size={22} />
                </button>
              </div>
              <input
                type="range"
                className="sd-seek"
                min={0}
                max={current.secs}
                value={Math.min(pos, current.secs)}
                onChange={(e) => setPos(Number(e.target.value))}
                aria-label="Seek"
                style={{ '--p': `${(pos / current.secs) * 100}%` } as React.CSSProperties}
              />
              <div className="sd-times">
                <span>{time(pos)}</span>
                <span>{time(current.secs)}</span>
              </div>
              <div className="sd-controls">
                <button type="button" className={`sd-iconbtn${shuffle ? ' lit' : ''}`} onClick={toggleShuffle} aria-label="Shuffle" aria-pressed={shuffle}>
                  <Icon name="shuffle" />
                </button>
                <button type="button" className="sd-iconbtn big" onClick={prev} aria-label="Previous">
                  <Icon name="prev" size={30} />
                </button>
                <button type="button" className="sd-play" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'}>
                  <Icon name={playing ? 'pause' : 'play'} size={30} />
                </button>
                <button type="button" className="sd-iconbtn big" onClick={skipNext} aria-label="Next">
                  <Icon name="next" size={30} />
                </button>
                <button
                  type="button"
                  className={`sd-iconbtn${repeat !== 'off' ? ' lit' : ''}`}
                  onClick={() => setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off'))}
                  aria-label={`Repeat: ${repeat}`}
                >
                  <Icon name="repeat" />
                  {repeat === 'one' && <b className="sd-one">1</b>}
                </button>
              </div>
              <div className="sd-player-bottom">
                <button type="button" className="sd-quality" onClick={() => setSheet('quality')} data-nodrag>
                  <Icon name="eq" size={14} />
                  {isDownloaded(current.id) ? 'Downloaded · plays offline' : `${quality} · ${QUALITY[quality].label}`}
                </button>
                <button type="button" className="sd-iconbtn" onClick={() => setSheet('queue')} aria-label="Up next" data-nodrag>
                  <Icon name="queue" />
                </button>
              </div>
            </div>
          )}

          {/* Sheets */}
          {(sheet || menuSong) && <button type="button" className="sd-scrim" onClick={closeAll} aria-label="Close" />}
          {sheet === 'queue' && (
            <div className="sd-sheet" data-nodrag role="dialog" aria-label="Up next">
              <h4>Up next</h4>
              <div className="sd-sheet-list">
                {queue.map((id, i) => {
                  const x = songById(id)
                  return (
                    <div key={`${id}-${i}`} className={`sd-row${i === index ? ' on' : ''}`}>
                      <button type="button" className="sd-row-main" onClick={() => goTo(i)}>
                        <Art hue={x.hue}>{i === index && <Bars playing={playing} />}</Art>
                        <span className="sd-row-text">
                          <span className="sd-row-title">{x.title}</span>
                          <span className="sd-row-sub">{x.artist}</span>
                        </span>
                      </button>
                      {i !== index && (
                        <button type="button" className="sd-iconbtn" onClick={() => removeAt(i)} aria-label={`Remove ${x.title}`}>
                          <Icon name="close" size={16} />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {sheet === 'quality' && (
            <div className="sd-sheet" data-nodrag role="dialog" aria-label="Audio quality">
              <h4>Audio quality</h4>
              <small>Applies from the next song.</small>
              {(Object.keys(QUALITY) as Quality[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`sd-option${quality === k ? ' on' : ''}`}
                  onClick={() => {
                    setQuality(k)
                    setSheet(null)
                  }}
                >
                  <i aria-hidden="true" />
                  <span>
                    <strong>{k}</strong>
                    <small>{QUALITY[k].detail}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
          {menuSong && (
            <div className="sd-sheet" data-nodrag role="dialog" aria-label={`Options for ${menuSong.title}`}>
              <div className="sd-menuhead">
                <Art hue={menuSong.hue} />
                <span className="sd-row-text">
                  <span className="sd-row-title">{menuSong.title}</span>
                  <span className="sd-row-sub">{menuSong.artist} • {menuSong.album}</span>
                </span>
              </div>
              {(
                [
                  ['play', 'Play now', () => playRadio(menuSong.id)],
                  ['queue', 'Play next', () => playNext(menuSong.id)],
                  ['plus', 'Add to queue', () => addToQueue(menuSong.id)],
                  ['radio', 'Start radio', () => playRadio(menuSong.id)],
                  downloads[menuSong.id] === undefined
                    ? ['download', 'Download', () => downloadAll([menuSong.id])]
                    : isDownloaded(menuSong.id)
                      ? ['close', 'Remove download', () => removeDownload(menuSong.id)]
                      : ['close', `Cancel download (${downloads[menuSong.id]}%)`, () => removeDownload(menuSong.id)],
                  [
                    'album',
                    'Go to album',
                    () => {
                      const a = albumByTitle(menuSong.album)
                      if (a) {
                        setTab('home')
                        setPages([{ kind: 'album', id: a.id }])
                        setExpand(0)
                      }
                    },
                  ],
                  [
                    'person',
                    `Go to ${menuSong.artist}`,
                    () => {
                      const r = artistByName(menuSong.artist)
                      if (r) {
                        setTab('home')
                        setPages([{ kind: 'artist', id: r.id }])
                        setExpand(0)
                      }
                    },
                  ],
                ] as [IconName, string, () => void][]
              ).map(([icon, label, go]) => (
                <button
                  key={label}
                  type="button"
                  className="sd-action"
                  onClick={() => {
                    setMenu(null)
                    go()
                  }}
                >
                  <Icon name={icon} />
                  {label}
                </button>
              ))}
            </div>
          )}

          {asking && (() => {
            const ids = asking.ids
            const done = ids.filter(isDownloaded)
            const left = ids.filter((id) => downloads[id] !== undefined && downloads[id] < 100)
            const close = () => setAsking(null)
            const removeAll = (list: string[]) => list.forEach(removeDownload)
            const choices: [string, () => void][] =
              left.length === 0
                ? [[`Remove ${done.length} songs`, () => removeAll(done)], ['Keep', () => {}]]
                : done.length > 0
                  ? [
                      [`Keep the ${done.length} downloaded, cancel the rest`, () => removeAll(left)],
                      [`Delete all ${done.length + left.length}`, () => removeAll([...done, ...left])],
                      ['Keep downloading', () => {}],
                    ]
                  : [['Cancel downloads', () => removeAll(left)], ['Keep downloading', () => {}]]
            return (
              <>
                <button type="button" className="sd-scrim" onClick={close} aria-label="Close" />
                <div className="sd-dialog" data-nodrag role="dialog" aria-label={left.length ? 'Stop downloading?' : 'Remove downloads?'}>
                  <h4>{left.length ? 'Stop downloading?' : 'Remove downloads?'}</h4>
                  <p>
                    {left.length === 0
                      ? `All ${done.length} songs of this ${asking.what} are downloaded. Remove them?`
                      : done.length > 0
                        ? `${done.length} of these ${ids.length} songs are already downloaded and ${left.length} are still to come. Delete the downloaded ones as well, or keep them and cancel only the new ones?`
                        : `${left.length} songs from this ${asking.what} are still downloading.`}
                  </p>
                  {choices.map(([label, go], i) => (
                    <button
                      key={label}
                      type="button"
                      className={i === choices.length - 1 ? 'quiet' : ''}
                      onClick={() => {
                        close()
                        go()
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )
          })()}

          {toast && (
            <div className="sd-toast" role="status">
              {toast}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Bars({ playing }: { playing: boolean }) {
  return (
    <span className={`sd-bars${playing ? ' playing' : ''}`} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  )
}
