import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { useInView } from '../../hooks/motion'
import {
  ALBUMS,
  ARTISTS,
  CACHE_LIMITS,
  DEFAULT_CACHE,
  FREE_BYTES,
  MIXES,
  MOODS,
  OWN_PLAYLISTS,
  SONGS,
  STARTING_PLAYS,
  VERSION_MODES,
  albumByTitle,
  art,
  artistByName,
  forYouFrom,
  hoursText,
  isAvailable,
  isDisliked,
  pulseFrom,
  radioFor,
  signature,
  sizeText,
  songById,
  time,
  versionFor,
  type DemoSong,
  type DlGroup,
  type Mood,
  type OwnPlaylist,
  type Version,
  type VersionMode,
} from './swarData'

type Tab = 'home' | 'search' | 'library'
type Repeat = 'off' | 'all' | 'one'
type Filter = 'All' | 'Songs' | 'Albums' | 'Artists'
type Quality = 'Auto' | 'High' | 'Normal' | 'Low'
type Sheet = 'queue' | 'quality' | 'playlist' | null
type Page =
  | { kind: 'album'; id: string }
  | { kind: 'artist'; id: string }
  | { kind: 'mix'; id: string }
  | { kind: 'playlist'; id: string }
  | { kind: 'settings' }
  | { kind: 'liked' }
  | { kind: 'history' }
  | { kind: 'downloads' }
  | { kind: 'dlgroup'; key: string }
  | { kind: 'shelf'; shelf: 'Playlists' | 'Albums' | 'Artists' }

const MB = 1024 * 1024

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
  trash: 'M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12M10.5 11v5M13.5 11v5',
  settings:
    'M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM12 3.5l1.6 2.3 2.7-.7.7 2.7 2.5 1.2-1.1 2.5 1.1 2.5-2.5 1.2-.7 2.7-2.7-.7L12 20.5l-1.6-2.3-2.7.7-.7-2.7-2.5-1.2L5.6 12 4.5 9.5 7 8.3l.7-2.7 2.7.7z',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z',
  circle: 'M12 4.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15z',
  checked: 'M12 4.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15zM8.5 12.2l2.4 2.4 4.6-4.8',
  note: 'M9 17.5V6l10-2v11.5M9 17.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM19 15.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z',
  playlistAdd: 'M4 6.5h12M4 11h12M4 15.5h7M17.5 13v7M14 16.5h7',
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
  const [filter, setFilter] = useState<Filter>('Songs')

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
  /** Plays per song on this phone: Library's pulse, On repeat and artists. */
  const [plays, setPlays] = useState<Record<string, number>>(STARTING_PLAYS)
  /** Your own playlists: add to them, take songs out, make new ones. */
  const [playlists, setPlaylists] = useState<OwnPlaylist[]>(OWN_PLAYLISTS)
  /** A new playlist being named; with a song, it goes in. */
  const [naming, setNaming] = useState<{ song?: string } | null>(null)
  const [versionMode, setVersionMode] = useState<VersionMode>('better')
  /** The Song | Video switch, per song, once flipped. */
  const [versions, setVersions] = useState<Record<string, Version>>({})
  const [sendPlays, setSendPlays] = useState(true)
  const [cacheLimit, setCacheLimit] = useState(DEFAULT_CACHE)
  const [cacheUsed, setCacheUsed] = useState(46 * MB)
  /** Download progress per song, 0 to 100. */
  const [downloads, setDownloads] = useState<Record<string, number>>({ s6: 100 })
  /** An album's or playlist's download being asked about (cancel or remove). */
  const [asking, setAsking] = useState<{ ids: string[]; what: string } | null>(null)
  /** Albums and playlists downloaded as a whole: kept together in Downloads. */
  const [groups, setGroups] = useState<Record<string, DlGroup>>({})
  /** Downloads' edit mode: the albums ("g:") and songs ("s:") ticked for deleting. */
  const [editing, setEditing] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(() => new Set())
  const togglePick = (k: string) =>
    setPicked((p) => {
      const n = new Set(p)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })
  const stopEditing = () => {
    setEditing(false)
    setPicked(new Set())
  }

  const [expand, setExpand] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [menu, setMenu] = useState<string | null>(null)
  /** The own playlist the menu's song was opened from (for "Remove from this playlist"). */
  const [menuFrom, setMenuFrom] = useState<string | null>(null)
  /** The song the playlist sheet is for. */
  const [saving, setSaving] = useState<string | null>(null)
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

  const played = useCallback((id: string) => {
    setHistory((h) => [id, ...h.filter((x) => x !== id)].slice(0, 12))
    setPlays((p) => ({ ...p, [id]: (p[id] ?? 0) + 1 }))
  }, [])

  const playList = useCallback((all: string[], start = 0, shuffled = false) => {
    const ids = all.filter(isAvailable)
    if (!ids.length) return
    start = Math.max(0, ids.indexOf(all[start]))
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
    played(list[start])
  }, [played])

  const playRadio = useCallback(
    (id: string) => playList(radioFor(id).filter((x) => x === id || !isDisliked(skips, x))),
    [playList, skips],
  )

  const goTo = useCallback(
    (i: number) => {
      setIndex(i)
      setPos(0)
      setPlaying(true)
      played(queue[i])
    },
    [queue, played],
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
    const fresh = ids.filter((id) => isAvailable(id) && downloads[id] === undefined)
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

  // -------------------------------------------------------------- playlists

  const madePlaylists = useRef(0)
  const togglePlaylist = (pid: string, id: string) => {
    const pl = playlists.find((p) => p.id === pid)
    if (!pl) return
    const has = pl.songs.includes(id)
    setPlaylists((ps) => ps.map((p) => (p.id === pid ? { ...p, songs: has ? p.songs.filter((x) => x !== id) : [...p.songs, id] } : p)))
    say(has ? `Removed from ${pl.title}` : `Added to ${pl.title}`)
  }
  const createPlaylist = (title: string, song?: string) => {
    madePlaylists.current += 1
    const id = `new-${madePlaylists.current}`
    setPlaylists((ps) => [{ id, title, hue: (madePlaylists.current * 71 + 120) % 360, songs: song ? [song] : [] }, ...ps])
    if (song) say(`Made ${title} with this song`)
    else open({ kind: 'playlist', id })
  }

  // -------------------------------------------------------------- navigation

  const open = (p: Page) => {
    setPages((s) => [...s, p])
    setExpand(0)
  }
  const back = () => {
    stopEditing()
    setPages((s) => s.slice(0, -1))
  }
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
  const versionOf = (x: DemoSong): Version => versions[x.id] ?? versionFor(x, versionMode)

  const openMenu = (id: string, from: string | null = null) => {
    setMenu(id)
    setMenuFrom(from)
  }

  const songRow = (song: DemoSong, opts: { list?: string[]; i?: number; numbered?: boolean; from?: string } = {}) => {
    const { list, i, numbered, from } = opts
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
      <button type="button" className="sd-iconbtn" onClick={() => openMenu(song.id, from)} aria-label={`More for ${song.title}`}>
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
          onChange={(e) => {
            // A new search always starts on Songs, as in the app.
            if (!query.trim() && e.target.value.trim()) setFilter('Songs')
            setQuery(e.target.value)
          }}
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
            <button key={r} type="button" className="sd-recent" onClick={() => {
                setFilter('Songs')
                setQuery(r)
              }}>
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
          {(nothing || (filter !== 'All' && !(filter === 'Songs' ? found.songs : filter === 'Albums' ? found.albums : found.artists).length)) && (
            <EmptyState
              icon="search"
              title={`No results for “${query.trim()}”`}
              text={
                filter === 'All' || nothing
                  ? 'Check the spelling, or try fewer or different words. In the demo, try “mumbai” or “raga”.'
                  : `Nothing under ${filter}. Try All, or different words.`
              }
            />
          )}
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

  const pulse = useMemo(() => pulseFrom(plays), [plays])
  const bars = useMemo(() => signature(pulse.plays * 31 + pulse.songs * 7 + pulse.artists), [pulse])
  const downloaded = Object.keys(downloads).filter((id) => downloads[id] === 100)
  // About 131 kbps of audio: 16 kB a second.
  const downloadedBytes = downloaded.reduce((sum, id) => sum + songById(id).secs * 16_400, 0)
  const recent = history.filter(isAvailable).slice(0, 8)
  const findMusic: [string, () => void] = ['Find music', () => switchTab('search')]

  const tile = (icon: IconName, title: string, sub: string | null, go: () => void, extra?: ReactNode) => (
    <button key={title} type="button" className="sd-tile" onClick={go}>
      <span className="sd-tile-icon">
        <Icon name={icon} size={18} />
      </span>
      <span className="sd-tile-text">
        <strong>{title}</strong>
        {sub && <small>{sub}</small>}
        {extra}
      </span>
    </button>
  )

  const heading = (title: string, strap: string, action?: [string, () => void]) => (
    <div className="sd-lib-h">
      <span>
        {strap && <small>{strap}</small>}
        <h4>{title}</h4>
      </span>
      {action && (
        <button type="button" className="sd-link" onClick={action[1]}>
          {action[0]}
        </button>
      )}
    </div>
  )

  const library = (
    <>
      <div className="sd-libhead">
        <span>
          <small>HI, DEMO</small>
          <h3>Library</h3>
        </span>
        <button type="button" className="sd-iconbtn" onClick={() => open({ kind: 'settings' })} aria-label="Settings">
          <Icon name="settings" />
        </button>
        <button type="button" className="sd-avatar" onClick={() => open({ kind: 'settings' })} aria-label="Account">
          <Art hue={20} round />
        </button>
      </div>

      <section className="sd-pulse" aria-label="Listening pulse">
        <div className="sd-pulse-top">
          <span>Listening pulse</span>
          {playing && <Bars playing />}
          <small>{playing ? 'Live' : 'On this phone'}</small>
        </div>
        {pulse.plays === 0 ? (
          <>
            <strong className="sd-pulse-first">Your pulse starts with your first song</strong>
            <p>Play anything for 30 seconds and Swar starts mapping your sound here: hours listened, your top artists and what's on repeat.</p>
          </>
        ) : (
          <>
            <div className="sd-pulse-big">
              <b>{hoursText(pulse.listenedSecs)}</b> listened
            </div>
            <p>Mostly {pulse.rotation[0]} lately</p>
          </>
        )}
        <div className={`sd-sig${playing && !reduced ? ' live' : ''}`} aria-hidden="true">
          {bars.map((h, i) => (
            <i key={i} style={{ '--h': h, animationDelay: `${(i * -0.06).toFixed(2)}s` } as React.CSSProperties} />
          ))}
        </div>
        <div className="sd-stats">
          {(
            [
              [pulse.plays, 'plays'],
              [pulse.songs, 'songs'],
              [pulse.artists, 'artists'],
              [pulse.plays, 'this week'],
            ] as [number, string][]
          ).map(([v, label]) => (
            <span key={label}>
              <b>{v}</b>
              <small>{label}</small>
            </span>
          ))}
        </div>
      </section>

      <div className="sd-bento">
        <div className="sd-liked">
          <button type="button" className="sd-liked-open" onClick={() => open({ kind: 'liked' })} aria-label={`Liked songs, ${liked.size} songs`}>
            <Icon name="heart" filled size={22} />
            <strong>
              Liked
              <br />
              songs
            </strong>
            <small>Your favourites</small>
          </button>
          <button
            type="button"
            className="sd-liked-shuffle"
            onClick={() => playList([...liked], 0, true)}
            disabled={!liked.size}
            aria-label="Shuffle liked songs"
          >
            <Icon name="shuffle" size={18} />
          </button>
        </div>
        <div className="sd-bento-col">
          {tile(
            'download',
            'Downloads',
            pending.length ? `${pending.length} downloading` : downloaded.length ? `${downloaded.length} · ${sizeText(downloadedBytes)}` : 'Play offline',
            () => open({ kind: 'downloads' }),
            pending.length > 0 && (
              <i className="sd-tile-bar" style={{ width: `${pending.reduce((sum, id) => sum + downloads[id], 0) / pending.length}%` }} />
            ),
          )}
          {tile('history', 'History', 'What you played', () => open({ kind: 'history' }))}
        </div>
        <div className="sd-bento-row">
          {tile('queue', 'Playlists', null, () => open({ kind: 'shelf', shelf: 'Playlists' }))}
          {tile('album', 'Albums', null, () => open({ kind: 'shelf', shelf: 'Albums' }))}
          {tile('person', 'Artists', null, () => open({ kind: 'shelf', shelf: 'Artists' }))}
        </div>
      </div>

      {recent.length > 0 && (
        <>
          {heading('Jump back in', 'Played on this phone')}
          <div className="sd-carousel">
            {recent.map((id, i) => {
              const x = songById(id)
              return (
                <button key={`r-${id}`} type="button" className={`sd-card sd-recent-card${isCurrent(id) ? ' on' : ''}`} onClick={() => playList(recent, i)}>
                  <Art hue={x.hue}>
                    <span className="sd-badge">{isCurrent(id) ? <Bars playing={playing} /> : <Icon name="play" size={14} />}</span>
                  </Art>
                  <span className="sd-card-title">{x.title}</span>
                  <span className="sd-card-sub">{x.artist}</span>
                </button>
              )
            })}
          </div>
        </>
      )}

      {pulse.top.length > 0 && (
        <>
          {heading('On repeat', 'Your most played lately', ['Play all', () => playList(pulse.top)])}
          {pulse.top.map((id, i) => {
            const x = songById(id)
            return (
              <button key={`top-${id}`} type="button" className={`sd-rank${isCurrent(id) ? ' on' : ''}`} onClick={() => playList(pulse.top, i)} aria-label={`Play ${x.title}, number ${i + 1} on repeat`}>
                <b>{String(i + 1).padStart(2, '0')}</b>
                <Art hue={x.hue} />
                <span className="sd-row-text">
                  <span className="sd-row-title">{x.title}</span>
                  <span className="sd-row-sub">{x.artist}</span>
                </span>
                <Icon name="play" size={18} />
              </button>
            )
          })}
        </>
      )}

      {heading('Your playlists', '', ['See all', () => open({ kind: 'shelf', shelf: 'Playlists' })])}
      <div className="sd-carousel">
        <button type="button" className="sd-card sd-newcard" onClick={() => setNaming({})}>
          <span className="sd-art">
            <span className="sd-plus">
              <Icon name="plus" size={22} />
            </span>
          </span>
          <span className="sd-card-title">New playlist</span>
          <span className="sd-card-sub">Private</span>
        </button>
        {playlists.map((p) => card(p.id, p.title, `${p.songs.filter(isAvailable).length} songs`, p.hue, () => open({ kind: 'playlist', id: p.id })))}
      </div>

      {pulse.rotation.length > 0 && (
        <>
          {heading('Artists in your rotation', '')}
          <div className="sd-artchips">
            {pulse.rotation.map((name, i) => {
              const r = artistByName(name)
              return (
                <button key={name} type="button" className="sd-artchip" onClick={() => r && open({ kind: 'artist', id: r.id })}>
                  <i style={{ opacity: Math.max(0.35, 1 - i * 0.07) }} />
                  {name}
                </button>
              )
            })}
          </div>
        </>
      )}
    </>
  )

  const songPage = (
    title: string,
    sub: string,
    hue: number,
    all: string[],
    opts: {
      numbered?: boolean
      round?: boolean
      empty?: { icon: IconName; title: string; text: string; find?: boolean }
      download?: DlGroup
      /** One of your own playlists: its songs' menus can take them out. */
      from?: string
      /** What plays: these songs, then (for a downloaded album) the rest. */
      queue?: (shuffled: boolean) => string[]
    },
  ) => {
    // Unavailable songs (greyed out on YouTube Music) aren't shown at all.
    const ids = all.filter(isAvailable)
    return (
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
      {ids.length === 0 && opts.empty && (
        <EmptyState icon={opts.empty.icon} title={opts.empty.title} text={opts.empty.text} action={opts.empty.find ? findMusic : undefined} />
      )}
      {ids.map((id, i) => songRow(songById(id), { list: opts.queue ? opts.queue(false) : ids, i, numbered: opts.numbered, from: opts.from }))}
    </>
    )
  }

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
      download: { key: m.id, title: m.title, hue: m.hue, isAlbum: false, ids: m.songs.filter(isAvailable) },
    })
  } else if (page?.kind === 'playlist') {
    const pl = playlists.find((x) => x.id === page.id)
    pageView = pl
      ? songPage(pl.title, `Playlist • Private • ${pl.songs.filter(isAvailable).length} songs`, pl.hue, pl.songs, {
          from: pl.id,
          download: { key: pl.id, title: pl.title, hue: pl.hue, isAlbum: false, ids: pl.songs.filter(isAvailable) },
          empty: {
            icon: 'queue',
            title: 'This playlist is empty',
            text: 'Open a song\'s ⋮ menu anywhere and pick Add to or remove from playlist to put it here.',
            find: true,
          },
        })
      : null
  } else if (page?.kind === 'liked') {
    pageView = songPage('Liked songs', `${liked.size} songs`, 330, [...liked], {
      empty: { icon: 'heart', title: 'No liked songs yet', text: 'Tap the heart in the player to like a song. Songs you like show up here.', find: true },
    })
  } else if (page?.kind === 'history') {
    pageView = songPage('History', 'What you played', 210, history, {
      empty: {
        icon: 'history',
        title: 'Nothing played yet',
        text: 'Songs you play show up here while Settings → Recommendations → Send plays to YouTube Music is on.',
      },
    })
  } else if (page?.kind === 'downloads') {
    const done = Object.keys(downloads).filter(isDownloaded)
    const shown = Object.values(groups).filter((g) => g.ids.some((id) => downloads[id] !== undefined))
    const grouped = new Set(shown.flatMap((g) => g.ids))
    const singles = done.filter((id) => !grouped.has(id))
    const loose = pending.filter((id) => !grouped.has(id))
    const every = [...shown.map((g) => `g:${g.key}`), ...singles.map((id) => `s:${id}`), ...loose.map((id) => `s:${id}`)]
    const allPicked = every.length > 0 && every.every((k) => picked.has(k))
    const check = (k: string, label: string) => (
      <input type="checkbox" className="sd-check" checked={picked.has(k)} onChange={() => togglePick(k)} aria-label={`Select ${label}`} />
    )
    const deletePicked = () => {
      const ids = [...picked].flatMap((k) => (k.startsWith('g:') ? (groups[k.slice(2)]?.ids ?? []) : [k.slice(2)]))
      ids.forEach(removeDownload)
      setGroups((g) => Object.fromEntries(Object.entries(g).filter(([key]) => !picked.has(`g:${key}`))))
      say(`Deleted ${ids.filter((id) => downloads[id] !== undefined).length} songs`)
      stopEditing()
    }
    pageView = (
      <>
        {(done.length > 0 || pending.length > 0) && (
          <div className="sd-editbar">
            {editing ? (
              <>
                <label className="sd-selectall">
                  <input type="checkbox" className="sd-check" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(every))} />
                  Select all
                </label>
                <button type="button" className="sd-danger" disabled={!picked.size} onClick={deletePicked}>
                  Delete{picked.size ? ` (${picked.size})` : ''}
                </button>
                <button type="button" className="sd-link" onClick={stopEditing}>
                  Done
                </button>
              </>
            ) : (
              <button type="button" className="sd-link" onClick={() => setEditing(true)}>
                Edit
              </button>
            )}
          </div>
        )}
        {songPage('Downloads', `${done.length} songs · play offline`, 190, [], {
          empty:
            done.length || pending.length
              ? undefined
              : {
                  icon: 'download',
                  title: 'Nothing downloaded yet',
                  text: 'Open a song\'s ⋮ menu and pick Download, or tap the download button in the player or on an album\'s page. Downloads play with no connection.',
                },
        })}
        {done.length > 0 && !editing && (
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
          const left = g.ids.filter((id) => downloads[id] !== undefined && downloads[id] < 100).length
          return (
            <div key={g.key} className="sd-row">
              {editing && check(`g:${g.key}`, g.title)}
              <button
                type="button"
                className="sd-row-main sd-listitem"
                onClick={() => (editing ? togglePick(`g:${g.key}`) : open({ kind: 'dlgroup', key: g.key }))}
              >
                <Art hue={g.hue} />
                <span className="sd-row-text">
                  <span className="sd-row-title">{g.title}</span>
                  <span className="sd-row-sub">
                    {g.isAlbum ? 'Album' : 'Playlist'} • {have} songs{left > 0 ? ` • ${left} downloading` : ''}
                  </span>
                </span>
              </button>
            </div>
          )
        })}
        {loose.length > 0 && <p className="sd-strap">In progress</p>}
        {loose.map((id) => {
          const x = songById(id)
          return (
            <div key={id} className="sd-row">
              {editing && check(`s:${id}`, x.title)}
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
        {singles.map((id, i) =>
          editing ? (
            <div key={id} className="sd-row">
              {check(`s:${id}`, songById(id).title)}
              <button type="button" className="sd-row-main" onClick={() => togglePick(`s:${id}`)}>
                <Art hue={songById(id).hue} />
                <span className="sd-row-text">
                  <span className="sd-row-title">{songById(id).title}</span>
                  <span className="sd-row-sub">{songById(id).artist}</span>
                </span>
              </button>
            </div>
          ) : (
            songRow(songById(id), { list: singles, i })
          ),
        )}
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
      ? (
          <>
            <button
              type="button"
              className="sd-iconbtn sd-pagedelete"
              onClick={() => setAsking({ ids: g.ids, what: g.isAlbum ? 'album' : 'playlist' })}
              aria-label={g.ids.some((id) => downloads[id] !== undefined && downloads[id] < 100) ? 'Stop downloading' : 'Remove downloads'}
            >
              <Icon name={g.ids.some((id) => downloads[id] !== undefined && downloads[id] < 100) ? 'close' : 'trash'} size={18} />
            </button>
            {songPage(g.title, `${g.isAlbum ? 'Album' : 'Playlist'} • ${ids.length} songs • downloaded`, g.hue, ids, {
              numbered: g.isAlbum,
              empty: {
                icon: 'download',
                title: 'Not downloaded any more',
                text: 'Its songs were removed from this phone. Open the album or playlist again to download it.',
              },
              queue,
            })}
          </>
        )
      : null
  } else if (page?.kind === 'settings') {
    const radio = (key: string, on: boolean, label: string, detail: string | null, pick: () => void, disabled = false) => (
      <button key={key} type="button" className={`sd-option${on ? ' on' : ''}`} onClick={pick} disabled={disabled} aria-pressed={on}>
        <i aria-hidden="true" />
        <span>
          <strong>{label}</strong>
          {detail && <small>{detail}</small>}
        </span>
      </button>
    )
    // A size can be picked when the phone has room for it: what's free plus what the cache holds.
    const room = FREE_BYTES + cacheUsed
    pageView = (
      <div className="sd-settings">
        <h3 className="sd-title">Settings</h3>
        <section>
          <h4>Account</h4>
          <p>Signed in to YouTube Music as Demo listener.</p>
        </section>
        <section>
          <h4>Recommendations</h4>
          <p>
            Swar learns from the songs you play through and the ones you skip, on this phone. Home's For you shelves are built from it and change as you
            listen; songs you keep skipping are left out of radios.
          </p>
          <label className="sd-switchrow">
            <span>
              <strong>Send plays to YouTube Music</strong>
              <small>Adds songs you play to your YouTube Music history, so its Home and radios learn from Swar too.</small>
            </span>
            <input type="checkbox" className="sd-switch" checked={sendPlays} onChange={() => setSendPlays((v) => !v)} />
          </label>
          <button
            type="button"
            className="sd-link"
            onClick={() => {
              setPlays({})
              setHistory([])
              setSkips({})
              say('Listening history on this phone cleared')
            }}
          >
            Clear listening history on this phone
          </button>
        </section>
        <section>
          <h4>Song or video</h4>
          <p>
            Many songs also have a music video, and its audio isn't always the same quality. Swar never shows the video: either way you hear the music
            with the song's cover. The Song | Video switch at the top of the player changes it for the song playing.
          </p>
          {VERSION_MODES.map((m) =>
            radio(m.key, versionMode === m.key, m.label, m.detail, () => {
              setVersionMode(m.key)
              setVersions({})
            }),
          )}
        </section>
        <section>
          <h4>Audio quality</h4>
          {(Object.keys(QUALITY) as Quality[]).map((k) => radio(k, quality === k, k, QUALITY[k].detail, () => setQuality(k)))}
        </section>
        <section>
          <h4>Storage</h4>
          <p>
            Songs you've played are kept on the phone, so replays and seeking don't download them again. When the cache is full, the songs played
            longest ago make room.
          </p>
          <strong className="sd-usage">
            Using {sizeText(cacheUsed)} of {sizeText(cacheLimit)} · {sizeText(FREE_BYTES)} free on the phone
          </strong>
          {CACHE_LIMITS.map((size) => {
            const fits = size <= room
            return radio(
              `c${size}`,
              size === cacheLimit,
              `${sizeText(size)}${size === DEFAULT_CACHE ? ' (default)' : ''}${fits ? '' : ' · not enough free space'}`,
              null,
              () => {
                setCacheLimit(size)
                setCacheUsed((u) => Math.min(u, size))
              },
              !fits,
            )
          })}
          <button
            type="button"
            className="sd-link"
            onClick={() => {
              setCacheUsed(0)
              say('Cache cleared')
            }}
          >
            Clear cache
          </button>
          <p>
            Played songs and downloads ({sizeText(downloadedBytes)}) live in Swar's private storage on this phone, which other apps and file managers
            can't open.
          </p>
        </section>
        <section>
          <h4>About</h4>
          <p>
            Swar 2.2.0. A YouTube Music player of its own, with its own stream lookup. No ads, no tracking: the only servers Swar talks to are
            YouTube's and Google's.
          </p>
        </section>
      </div>
    )
  } else if (page?.kind === 'shelf') {
    const items =
      page.shelf === 'Playlists'
        ? [
            ...playlists.map((p) => ({ key: p.id, title: p.title, sub: 'Your playlist', hue: p.hue, round: false, go: () => open({ kind: 'playlist', id: p.id }) })),
            ...MIXES.map((m) => ({ key: m.id, title: m.title, sub: m.subtitle, hue: m.hue, round: false, go: () => open({ kind: 'mix', id: m.id }) })),
          ]
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
          if (naming) setNaming(null)
          else if (asking) setAsking(null)
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
                {current.video && !isDownloaded(current.id) ? (
                  <span className="sd-version">
                    <span className="sd-segment" role="group" aria-label="Song or video version" data-nodrag>
                      {(['Song', 'Video'] as Version[]).map((v) => (
                        <button
                          key={v}
                          type="button"
                          className={versionOf(current) === v ? 'on' : ''}
                          aria-pressed={versionOf(current) === v}
                          onClick={() => setVersions((x) => ({ ...x, [current.id]: v }))}
                        >
                          {v}
                        </button>
                      ))}
                    </span>
                    <small>
                      Song {current.video.song} · Video {current.video.video} kbps
                    </small>
                  </span>
                ) : (
                  <span className="sd-player-label">
                    <i />
                    NOW PLAYING
                  </span>
                )}
                <button type="button" className="sd-iconbtn" onClick={() => openMenu(current.id)} aria-label="More">
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
                  {isDownloaded(current.id)
                    ? 'Downloaded · plays offline'
                    : current.video && versionOf(current) === 'Video'
                      ? `${quality} · video's audio · ${current.video.video} kbps`
                      : `${quality} · ${QUALITY[quality].label}`}
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
                  [
                    'playlistAdd',
                    'Add to or remove from playlist',
                    () => {
                      setSaving(menuSong.id)
                      setSheet('playlist')
                    },
                  ],
                  ...(menuFrom ? [['trash', 'Remove from this playlist', () => togglePlaylist(menuFrom, menuSong.id)]] : []),
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

          {sheet === 'playlist' && saving && (
            <div className="sd-sheet" data-nodrag role="dialog" aria-label="Save to playlist">
              <h4>Save to playlist</h4>
              <small>{songById(saving).title}</small>
              <button type="button" className="sd-action" onClick={() => setNaming({ song: saving })}>
                <Icon name="plus" />
                New playlist
              </button>
              <div className="sd-sheet-list">
                {playlists.map((p) => {
                  const has = p.songs.includes(saving)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`sd-pick${has ? ' on' : ''}`}
                      onClick={() => togglePlaylist(p.id, saving)}
                      aria-label={`${p.title}: ${has ? 'in this playlist, tap to remove' : 'tap to add'}`}
                    >
                      <Art hue={p.hue} />
                      <span className="sd-row-text">
                        <span className="sd-row-title">{p.title}</span>
                        <span className="sd-row-sub">{p.songs.filter(isAvailable).length} songs · Private</span>
                      </span>
                      <Icon name={has ? 'checked' : 'circle'} />
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {naming && (
            <NewPlaylist
              onCreate={(title) => {
                createPlaylist(title, naming.song)
                setNaming(null)
                setSheet(null)
              }}
              onCancel={() => setNaming(null)}
            />
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

function EmptyState({ icon, title, text, action }: { icon: IconName; title: string; text: string; action?: [string, () => void] }) {
  return (
    <div className="sd-emptystate">
      <Icon name={icon} size={34} />
      <strong>{title}</strong>
      <p>{text}</p>
      {action && (
        <button type="button" className="sd-primary" onClick={action[1]}>
          {action[0]}
        </button>
      )}
    </div>
  )
}

function NewPlaylist({ onCreate, onCancel }: { onCreate: (title: string) => void; onCancel: () => void }) {
  const [title, setTitle] = useState('')
  const ok = title.trim().length > 0
  return (
    <>
      <button type="button" className="sd-scrim top" onClick={onCancel} aria-label="Close" />
      <form
        className="sd-dialog"
        data-nodrag
        role="dialog"
        aria-label="New playlist"
        onSubmit={(e) => {
          e.preventDefault()
          if (ok) onCreate(title.trim())
        }}
      >
        <h4>New playlist</h4>
        <input className="sd-field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Name" aria-label="Playlist name" autoFocus />
        <p>Private: only you can see it.</p>
        <button type="submit" disabled={!ok}>
          Create
        </button>
        <button type="button" className="quiet" onClick={onCancel}>
          Cancel
        </button>
      </form>
    </>
  )
}
