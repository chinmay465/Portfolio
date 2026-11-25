import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  EMPTY,
  SERVICES,
  TITLES,
  art,
  facts,
  handoff,
  reasonText,
  recommend,
  serviceBy,
  similar,
  titleById,
  type DemoService,
  type DemoTitle,
  type ServiceKey,
  type Signals,
  type Step,
} from './ekatraData'

type Tab = 'home' | 'search' | 'list' | 'apps'
type ListTab = 'Saved' | 'Watched' | 'Liked'
type Kind = 'All' | 'Films' | 'Series'
type PlayIn = 'app' | 'ekatra'

interface Web {
  service: ServiceKey
  title?: string
  playing: boolean
  progress: number
  desktop: boolean
}

interface Handoff {
  title: DemoTitle
  service: DemoService
  steps: Step[]
  done: boolean
}

// ------------------------------------------------------------------ icons

const PATHS = {
  home: 'M4 11l8-6.5 8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z',
  search: 'M10.5 4.5a6 6 0 1 1 0 12 6 6 0 0 1 0-12zM15 15l4.5 4.5',
  list: 'M7 4.5h10a1 1 0 0 1 1 1v14l-6-3.5-6 3.5v-14a1 1 0 0 1 1-1z',
  apps: 'M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5zM14 14h5v5h-5z',
  back: 'M15 5.5L8.5 12 15 18.5',
  close: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
  play: 'M8 5.5v13l10.5-6.5z',
  pause: 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z',
  globe: 'M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16zM4 12h16M12 4c2.5 2.5 2.5 13.5 0 16M12 4c-2.5 2.5-2.5 13.5 0 16',
  open: 'M14 4.5h5.5V10M19.5 4.5L11 13M17 14v5H5V7h5',
  like: 'M7 10.5V19H4.5v-8.5zM7 10.5l3.5-6c1.5 0 2.5 1 2 3l-.7 3H18a1.5 1.5 0 0 1 1.5 1.8l-1.2 6A1.5 1.5 0 0 1 16.8 19H7',
  nope: 'M7 13.5V5H4.5v8.5zM7 13.5l3.5 6c1.5 0 2.5-1 2-3l-.7-3H18a1.5 1.5 0 0 0 1.5-1.8l-1.2-6A1.5 1.5 0 0 0 16.8 5H7',
  save: 'M7 4.5h10a1 1 0 0 1 1 1v14l-6-3.5-6 3.5v-14a1 1 0 0 1 1-1z',
  saved: 'M7 4.5h10a1 1 0 0 1 1 1v14l-6-3.5-6 3.5v-14a1 1 0 0 1 1-1zM9 10l2 2 4-4',
  settings:
    'M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM12 3.5l1.6 2.3 2.7-.7.7 2.7 2.5 1.2-1.1 2.5 1.1 2.5-2.5 1.2-.7 2.7-2.7-.7L12 20.5l-1.6-2.3-2.7.7-.7-2.7-2.5-1.2L5.6 12 4.5 9.5 7 8.3l.7-2.7 2.7.7z',
  desktop: 'M4 5h16v10H4zM9 19h6M12 15v4',
  phone: 'M8 3.5h8a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1zM11 17.5h2',
  check: 'M5.5 12.5l4 4L18.5 7.5',
  dot: 'M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z',
  download: 'M12 4.5v10M7.5 10.5L12 15l4.5-4.5M5.5 19.5h13',
} as const
type IconName = keyof typeof PATHS
const FILLED: IconName[] = ['play', 'pause', 'dot']

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const fill = FILLED.includes(name)
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className="ed-icon">
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

function Badges({ title }: { title: DemoTitle }) {
  return (
    <span className="ed-badges">
      {title.services.slice(0, 2).map((s) => (
        <span key={s} className="ed-badge" style={{ background: serviceBy(s).color }}>
          {serviceBy(s).badge}
        </span>
      ))}
    </span>
  )
}

const on = (x: DemoTitle) => x.services.map((s) => serviceBy(s).name).join(' and ')
const subtitle = (x: DemoTitle) => [x.year, x.kind, x.genres[0]].join(' · ')

// ------------------------------------------------------------------ demo

/**
 * Ekatra for Android's screens, working, on a made-up catalogue: one Home
 * across five services, search, title pages with Watch in app (the app's
 * hand-off, step by step) and Watch in Ekatra (the service's site in a tab),
 * My List and the Apps grid. Nothing streams; playback is simulated.
 */
export default function EkatraDemo({ reduced }: { reduced: boolean }) {
  const [tab, setTab] = useState<Tab>('home')
  const [pages, setPages] = useState<string[]>([])
  const [signals, setSignals] = useState<Signals>(EMPTY)
  const [filter, setFilter] = useState<ServiceKey | null>(null)
  const [mine, setMine] = useState<ServiceKey[]>([])
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<Kind>('All')
  const [listTab, setListTab] = useState<ListTab>('Saved')
  const [web, setWeb] = useState<Web | null>(null)
  const [hand, setHand] = useState<Handoff | null>(null)
  const [settings, setSettings] = useState(false)
  const [playIn, setPlayIn] = useState<PlayIn>('app')
  const [status, setStatus] = useState('')
  const [openTabs, setOpenTabs] = useState<ServiceKey[]>([])
  const scroll = useRef<HTMLDivElement>(null)

  const page = pages.length ? titleById(pages[pages.length - 1]) : undefined
  const say = (s: string) => setStatus(s)

  useEffect(() => {
    scroll.current?.scrollTo?.({ top: 0 })
  }, [tab, page?.id, settings])

  // Simulated playback in a web tab.
  const playing = Boolean(web?.playing)
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => setWeb((w) => (w && w.playing ? { ...w, progress: Math.min(1, w.progress + 0.01) } : w)), 600)
    return () => clearInterval(id)
  }, [playing])

  // The hand-off sheet walks its steps, then lands.
  const handPending = Boolean(hand && !hand.done)
  useEffect(() => {
    if (!handPending) return
    const id = setTimeout(() => setHand((h) => (h ? { ...h, done: true } : h)), reduced ? 0 : 900)
    return () => clearTimeout(id)
  }, [handPending, reduced])

  const opened = (x: DemoTitle, s: ServiceKey) =>
    setSignals((g) => ({
      ...g,
      opened: { ...g.opened, [x.id]: (g.opened[x.id] ?? 0) + 1 },
      history: [{ id: x.id, service: s, at: Date.now() }, ...g.history.filter((h) => h.id !== x.id)],
    }))

  const toggle = (key: 'liked' | 'disliked' | 'saved', x: DemoTitle) =>
    setSignals((g) => {
      const has = g[key].includes(x.id)
      const next = { ...g, [key]: has ? g[key].filter((i) => i !== x.id) : [...g[key], x.id] }
      if (!has && key === 'liked') next.disliked = next.disliked.filter((i) => i !== x.id)
      if (!has && key === 'disliked') {
        next.liked = next.liked.filter((i) => i !== x.id)
        next.saved = next.saved.filter((i) => i !== x.id)
      }
      return next
    })

  const openTitle = (x: DemoTitle) => {
    setSettings(false)
    setPages((p) => [...p, x.id])
  }

  const openWeb = (service: ServiceKey, title?: DemoTitle) => {
    setOpenTabs((t) => (t.includes(service) ? t : [...t, service]))
    setWeb({ service, title: title?.id, playing: false, progress: 0, desktop: service === 'netflix' || service === 'prime' })
  }

  const watch = (x: DemoTitle, key: ServiceKey, inEkatra: boolean) => {
    const s = serviceBy(key)
    const plan = handoff(x, s, inEkatra || playIn === 'ekatra')
    opened(x, key)
    if (plan.lands.kind === 'web') {
      if (!inEkatra && playIn === 'app' && !s.installed) say(`${s.name} isn't installed, opening its website`)
      openWeb(key, x)
      return
    }
    setHand({ title: x, service: s, steps: plan.steps, done: reduced })
  }

  const services = filter ? [filter] : mine
  const known = TITLES

  const switchTab = (t: Tab) => {
    setTab(t)
    setPages([])
    setSettings(false)
  }

  return (
    <div className="ed" role="region" aria-label="Ekatra for Android, interactive demo">
      <div className="ed-phone">
        <div className="ed-screen">
          <div className="ed-status" aria-hidden="true">
            <span>9:41</span>
            <span>5G ▮▮▮</span>
          </div>
          <div className="ed-scroll" ref={scroll}>
            {settings ? (
              <SettingsPage
                playIn={playIn}
                setPlayIn={setPlayIn}
                mine={mine}
                setMine={setMine}
                onBack={() => setSettings(false)}
                onSignOut={() => {
                  setOpenTabs([])
                  say('Signed out of every service in Ekatra')
                }}
              />
            ) : page ? (
              <TitlePage
                key={page.id}
                title={page}
                signals={signals}
                mine={mine}
                onBack={() => setPages((p) => p.slice(0, -1))}
                onOpen={openTitle}
                onToggle={toggle}
                onWatch={watch}
                say={say}
              />
            ) : tab === 'home' ? (
              <HomeTab
                signals={signals}
                services={services}
                mine={mine}
                filter={filter}
                setFilter={setFilter}
                known={known}
                onOpen={openTitle}
                onSettings={() => setSettings(true)}
              />
            ) : tab === 'search' ? (
              <SearchTab query={query} setQuery={setQuery} kind={kind} setKind={setKind} mine={mine} onOpen={openTitle} />
            ) : tab === 'list' ? (
              <ListTabView signals={signals} listTab={listTab} setListTab={setListTab} onOpen={openTitle} onClear={() => setSignals((g) => ({ ...g, history: [], opened: {} }))} />
            ) : (
              <AppsTab
                mine={mine}
                openTabs={openTabs}
                onToggle={(k) => setMine((m) => (m.includes(k) ? m.filter((x) => x !== k) : [...m, k]))}
                onOpenWeb={(k) => openWeb(k)}
                onApp={(s) => say(s.installed ? `Opened the ${s.name} app` : `${s.name} on Google Play`)}
              />
            )}
          </div>

          <nav className="ed-nav" aria-label="Ekatra tabs">
            {(
              [
                ['home', 'Home', 'home'],
                ['search', 'Search', 'search'],
                ['list', 'My List', 'list'],
                ['apps', 'Apps', 'apps'],
              ] as const
            ).map(([t, label, icon]) => (
              <button key={t} type="button" className={`ed-tab${tab === t ? ' on' : ''}`} aria-current={tab === t ? 'page' : undefined} onClick={() => switchTab(t)}>
                <Icon name={icon} size={20} />
                <span>{label}</span>
              </button>
            ))}
          </nav>

          {web && (
            <WebTab
              web={web}
              setWeb={setWeb}
              onClose={() => setWeb(null)}
              onOpenApp={(s) => say(s.installed ? `Opened this page in the ${s.name} app` : `${s.name} on Google Play`)}
              onPick={(x) => {
                opened(x, web.service)
                setWeb({ ...web, title: x.id, playing: false, progress: 0 })
              }}
            />
          )}

          {hand && <HandoffSheet hand={hand} reduced={reduced} onClose={() => setHand(null)} />}

          <p className="ed-toast" role="status" aria-live="polite" data-show={status ? 'true' : 'false'}>
            {status}
          </p>
        </div>
      </div>
      <ToastTimer status={status} clear={() => setStatus('')} />
    </div>
  )
}

function ToastTimer({ status, clear }: { status: string; clear: () => void }) {
  useEffect(() => {
    if (!status) return
    const id = setTimeout(clear, 2600)
    return () => clearTimeout(id)
  }, [status, clear])
  return null
}

// ------------------------------------------------------------------ cards

function Poster({ title, caption, onOpen }: { title: DemoTitle; caption?: string; onOpen: (x: DemoTitle) => void }) {
  return (
    <button type="button" className="ed-poster" aria-label={`${title.name}, on ${on(title)}`} onClick={() => onOpen(title)}>
      <span className="ed-art" style={{ background: art(title.hue, serviceBy(title.services[0]).color) }}>
        <Badges title={title} />
        <span className="ed-art-name">{title.name}</span>
      </span>
      <span className="ed-poster-name">{title.name}</span>
      <span className="ed-poster-sub">{caption ?? subtitle(title)}</span>
    </button>
  )
}

function Shelf({ heading, sub, titles, captions, onOpen }: { heading: string; sub?: string; titles: DemoTitle[]; captions?: Record<string, string>; onOpen: (x: DemoTitle) => void }) {
  if (!titles.length) return null
  return (
    <section className="ed-shelf" aria-label={heading}>
      <h4 className="ed-h">{heading}</h4>
      {sub && <p className="ed-sub">{sub}</p>}
      <div className="ed-row">
        {titles.map((x) => (
          <Poster key={x.id} title={x} caption={captions?.[x.id]} onOpen={onOpen} />
        ))}
      </div>
    </section>
  )
}

function Pill({ label, on: selected, onClick, color }: { label: string; on: boolean; onClick: () => void; color?: string }) {
  return (
    <button type="button" className={`ed-pill${selected ? ' on' : ''}`} aria-pressed={selected} onClick={onClick}>
      {color && <span className="ed-dot" style={{ background: color }} />}
      {label}
    </button>
  )
}

function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="ed-empty">
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  )
}

// ------------------------------------------------------------------ Home

function HomeTab({
  signals,
  services,
  mine,
  filter,
  setFilter,
  known,
  onOpen,
  onSettings,
}: {
  signals: Signals
  services: ServiceKey[]
  mine: ServiceKey[]
  filter: ServiceKey | null
  setFilter: (k: ServiceKey | null) => void
  known: DemoTitle[]
  onOpen: (x: DemoTitle) => void
  onSettings: () => void
}) {
  const picks = useMemo(() => recommend(known, signals, services, 30), [known, signals, services])
  const hero = picks.slice(0, 5)
  const forYou = picks.slice(5)
  const history = signals.history
    .map((h) => ({ h, x: titleById(h.id)! }))
    .filter(({ h, x }) => services.length === 0 || services.includes(h.service) || x.services.some((s) => services.includes(s)))
  const saved = [...signals.saved].reverse().map((id) => titleById(id)!).filter((x) => services.length === 0 || x.services.some((s) => services.includes(s)))
  const chips = SERVICES.filter((s) => mine.length === 0 || mine.includes(s.key))

  return (
    <>
      <div className="ed-top">
        <span className="ed-wordmark">Ekatra</span>
        <button type="button" className="ed-iconbtn" aria-label="Settings" onClick={onSettings}>
          <Icon name="settings" size={20} />
        </button>
      </div>
      <div className="ed-chips" role="group" aria-label="Filter by service">
        <Pill label="All" on={filter === null} onClick={() => setFilter(null)} />
        {chips.map((s) => (
          <Pill key={s.key} label={s.name} color={s.color} on={filter === s.key} onClick={() => setFilter(filter === s.key ? null : s.key)} />
        ))}
      </div>
      {hero.length > 0 && (
        <div className="ed-hero" aria-label="Picks for you">
          {hero.map(({ title: x, reason }) => (
            <button key={x.id} type="button" className="ed-wide" aria-label={`${x.name}: ${reasonText(reason)}`} onClick={() => onOpen(x)}>
              <span className="ed-wide-art" style={{ background: art(x.hue, serviceBy(x.services[0]).color) }} />
              <Badges title={x} />
              <span className="ed-wide-text">
                <span className="ed-eyebrow">Pick for you</span>
                <strong>{x.name}</strong>
                <span>{reasonText(reason)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      <Shelf
        heading="Continue watching"
        sub="Pick up where you left off"
        titles={history.map((r) => r.x)}
        captions={Object.fromEntries(history.map(({ h, x }) => [x.id, `On ${serviceBy(h.service).name}`]))}
        onOpen={onOpen}
      />
      <Shelf
        heading="For you"
        sub="From what you like, open and save"
        titles={forYou.map((p) => p.title)}
        captions={Object.fromEntries(forYou.map((p) => [p.title.id, reasonText(p.reason)]))}
        onOpen={onOpen}
      />
      <Shelf heading="My List" titles={saved} onOpen={onOpen} />
      {SERVICES.filter((s) => services.length === 0 || services.includes(s.key)).map((s) => (
        <Shelf
          key={s.key}
          heading={`Top on ${s.name}`}
          titles={known.filter((x) => x.services.includes(s.key) && !signals.disliked.includes(x.id)).sort((a, b) => b.popularity - a.popularity)}
          onOpen={onOpen}
        />
      ))}
    </>
  )
}

// ------------------------------------------------------------------ Search

function SearchTab({
  query,
  setQuery,
  kind,
  setKind,
  mine,
  onOpen,
}: {
  query: string
  setQuery: (q: string) => void
  kind: Kind
  setKind: (k: Kind) => void
  mine: ServiceKey[]
  onOpen: (x: DemoTitle) => void
}) {
  const q = query.trim().toLowerCase()
  const words = q.split(/\s+/).filter(Boolean)
  const results =
    q.length < 2
      ? []
      : TITLES.filter((x) => {
          const hay = [x.name, x.overview, ...x.tags, ...x.genres, ...x.services.map((s) => serviceBy(s).name)].join(' ').toLowerCase()
          return words.every((w) => hay.includes(w)) && (kind === 'All' || (kind === 'Films' ? x.kind === 'Film' : x.kind === 'Series'))
        }).sort((a, b) => Number(mine.length === 0 || b.services.some((s) => mine.includes(s))) - Number(mine.length === 0 || a.services.some((s) => mine.includes(s))))
  return (
    <>
      <label className="ed-search">
        <Icon name="search" />
        <input
          type="search"
          value={query}
          placeholder="Films, series, across every app"
          aria-label="Search every app"
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {q.length < 2 ? (
        <Empty title="Search every app at once">Try “mumbai”, “space” or “comedy”. Each result shows where it streams.</Empty>
      ) : (
        <>
          <div className="ed-chips" role="group" aria-label="Films or series">
            {(['All', 'Films', 'Series'] as const).map((k) => (
              <Pill key={k} label={k} on={kind === k} onClick={() => setKind(k)} />
            ))}
          </div>
          {results.length === 0 ? (
            <Empty title="No results">Nothing in the demo catalogue matches “{query.trim()}”.</Empty>
          ) : (
            <div className="ed-grid">
              {results.map((x) => (
                <Poster key={x.id} title={x} onOpen={onOpen} />
              ))}
            </div>
          )}
        </>
      )}
    </>
  )
}

// ------------------------------------------------------------------ Title page

function TitlePage({
  title: x,
  signals,
  mine,
  onBack,
  onOpen,
  onToggle,
  onWatch,
  say,
}: {
  title: DemoTitle
  signals: Signals
  mine: ServiceKey[]
  onBack: () => void
  onOpen: (x: DemoTitle) => void
  onToggle: (key: 'liked' | 'disliked' | 'saved', x: DemoTitle) => void
  onWatch: (x: DemoTitle, s: ServiceKey, inEkatra: boolean) => void
  say: (s: string) => void
}) {
  const saved = signals.saved.includes(x.id)
  const liked = signals.liked.includes(x.id)
  const nope = signals.disliked.includes(x.id)
  const more = similar(x, TITLES, mine, signals.disliked)
  const ordered = [...x.services].sort((a, b) => Number(mine.length === 0 || mine.includes(b)) - Number(mine.length === 0 || mine.includes(a)))
  return (
    <article className="ed-title">
      <div className="ed-backdrop" style={{ background: art(x.hue, serviceBy(x.services[0]).color) }}>
        <button type="button" className="ed-iconbtn ed-float" aria-label="Back" onClick={onBack}>
          <Icon name="back" />
        </button>
      </div>
      <div className="ed-title-body">
        <h3>{x.name}</h3>
        <p className="ed-facts">{facts(x)}</p>
        <div className="ed-genres">
          {x.genres.map((g) => (
            <span key={g}>{g}</span>
          ))}
        </div>

        <h4 className="ed-h">Where to watch</h4>
        {ordered.map((k) => {
          const s = serviceBy(k)
          const exact = x.exact.includes(k)
          return (
            <div key={k} className="ed-where">
              <div className="ed-where-head">
                <span className="ed-where-logo" style={{ background: s.color }}>
                  {s.name[0]}
                </span>
                <span>
                  <strong>{s.name}</strong>
                  <small>
                    {!s.installed
                      ? 'App not installed · watch it here in Ekatra'
                      : exact
                        ? 'Opens this title in the app'
                        : s.searchable
                          ? "Opens the app's search for it"
                          : 'Opens the app, title copied for its search'}
                  </small>
                </span>
              </div>
              <div className="ed-where-btns">
                {s.installed && (
                  <button type="button" className="ed-btn ed-btn-primary" aria-label={`Watch ${x.name} in the ${s.name} app`} onClick={() => onWatch(x, k, false)}>
                    <Icon name="play" size={16} /> Watch in app
                  </button>
                )}
                <button type="button" className="ed-btn" aria-label={`Watch ${x.name} on ${s.name} in Ekatra`} onClick={() => onWatch(x, k, true)}>
                  <Icon name="globe" size={16} /> Watch in Ekatra
                </button>
              </div>
            </div>
          )
        })}

        <div className="ed-reacts">
          <button
            type="button"
            aria-pressed={saved}
            aria-label={saved ? 'Remove from My List' : 'Add to My List'}
            onClick={() => {
              onToggle('saved', x)
              say(saved ? 'Removed from My List' : 'Added to My List')
            }}
          >
            <Icon name={saved ? 'saved' : 'save'} />
            <span>{saved ? 'In My List' : 'My List'}</span>
          </button>
          <button type="button" aria-pressed={liked} onClick={() => onToggle('liked', x)}>
            <Icon name="like" />
            <span>Like</span>
          </button>
          <button type="button" aria-pressed={nope} onClick={() => onToggle('disliked', x)}>
            <Icon name="nope" />
            <span>Not for me</span>
          </button>
        </div>

        <p className="ed-overview">{x.overview}</p>
        <h4 className="ed-h">Cast</h4>
        <div className="ed-cast">
          {x.cast.map((c) => (
            <span key={c}>
              <span className="ed-face" aria-hidden="true">
                {c
                  .split(' ')
                  .map((w) => w[0])
                  .join('')}
              </span>
              {c}
            </span>
          ))}
        </div>
      </div>
      <Shelf heading="More like this" titles={more} onOpen={onOpen} />
    </article>
  )
}

// ------------------------------------------------------------------ My List

function ListTabView({
  signals,
  listTab,
  setListTab,
  onOpen,
  onClear,
}: {
  signals: Signals
  listTab: ListTab
  setListTab: (t: ListTab) => void
  onOpen: (x: DemoTitle) => void
  onClear: () => void
}) {
  const rows: { x: DemoTitle; caption?: string }[] =
    listTab === 'Saved'
      ? [...signals.saved].reverse().map((id) => ({ x: titleById(id)! }))
      : listTab === 'Watched'
        ? signals.history.map((h) => ({ x: titleById(h.id)!, caption: `${serviceBy(h.service).name} · just now` }))
        : TITLES.filter((x) => signals.liked.includes(x.id)).map((x) => ({ x }))
  return (
    <>
      <div className="ed-top">
        <h3 className="ed-page-title">My List</h3>
        {listTab === 'Watched' && rows.length > 0 && (
          <button type="button" className="ed-link" onClick={onClear}>
            Clear
          </button>
        )}
      </div>
      <div className="ed-chips" role="group" aria-label="Lists">
        {(['Saved', 'Watched', 'Liked'] as const).map((t) => (
          <Pill key={t} label={t} on={listTab === t} onClick={() => setListTab(t)} />
        ))}
      </div>
      {rows.length === 0 ? (
        <Empty title={listTab === 'Saved' ? 'Nothing saved yet' : listTab === 'Watched' ? 'Nothing watched yet' : 'No likes yet'}>
          {listTab === 'Saved'
            ? 'Tap My List on any title, from any app, to keep it here.'
            : listTab === 'Watched'
              ? 'Titles you open in their app or in Ekatra show up here, newest first.'
              : 'Likes shape For you on Home.'}
        </Empty>
      ) : (
        <div className="ed-grid">
          {rows.map(({ x, caption }) => (
            <Poster key={x.id} title={x} caption={caption} onOpen={onOpen} />
          ))}
        </div>
      )}
    </>
  )
}

// ------------------------------------------------------------------ Apps

function AppsTab({
  mine,
  openTabs,
  onToggle,
  onOpenWeb,
  onApp,
}: {
  mine: ServiceKey[]
  openTabs: ServiceKey[]
  onToggle: (k: ServiceKey) => void
  onOpenWeb: (k: ServiceKey) => void
  onApp: (s: DemoService) => void
}) {
  return (
    <>
      <div className="ed-top">
        <h3 className="ed-page-title">Apps</h3>
      </div>
      <p className="ed-sub ed-pad">Open a service here to browse and watch on its website, or jump to its app. Tick the ones you subscribe to.</p>
      <div className="ed-apps">
        {SERVICES.map((s) => {
          const ticked = mine.includes(s.key)
          return (
            <div key={s.key} className="ed-app" style={{ '--svc': s.color } as CSSProperties}>
              <div className="ed-app-top">
                {openTabs.includes(s.key) ? (
                  <span className="ed-live">
                    <Icon name="dot" size={10} /> Open
                  </span>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  className={`ed-tick${ticked ? ' on' : ''}`}
                  aria-pressed={ticked}
                  aria-label={`I subscribe to ${s.name}`}
                  onClick={() => onToggle(s.key)}
                >
                  {ticked && <Icon name="check" size={14} />}
                </button>
              </div>
              <button type="button" className="ed-app-name" aria-label={`Open ${s.name} in Ekatra`} onClick={() => onOpenWeb(s.key)}>
                {s.name}
              </button>
              <button type="button" className="ed-app-btn" onClick={() => onApp(s)}>
                <Icon name={s.installed ? 'open' : 'download'} size={14} />
                {s.installed ? 'Open the app' : 'Get the app'}
              </button>
            </div>
          )
        })}
      </div>
    </>
  )
}

// ------------------------------------------------------------------ Settings

function SettingsPage({
  playIn,
  setPlayIn,
  mine,
  setMine,
  onBack,
  onSignOut,
}: {
  playIn: PlayIn
  setPlayIn: (p: PlayIn) => void
  mine: ServiceKey[]
  setMine: (m: ServiceKey[]) => void
  onBack: () => void
  onSignOut: () => void
}) {
  return (
    <>
      <div className="ed-top">
        <button type="button" className="ed-iconbtn" aria-label="Back" onClick={onBack}>
          <Icon name="back" />
        </button>
        <h3 className="ed-page-title">Settings</h3>
      </div>
      <section className="ed-card">
        <h4>Catalogue</h4>
        <p>The app takes your own free TMDB key for everything streaming in India. This demo runs on a made-up catalogue.</p>
      </section>
      <section className="ed-card">
        <h4>My apps</h4>
        {SERVICES.map((s) => (
          <label key={s.key} className="ed-check">
            <input
              type="checkbox"
              checked={mine.includes(s.key)}
              onChange={(e) => setMine(e.target.checked ? [...mine, s.key] : mine.filter((k) => k !== s.key))}
            />
            <span className="ed-dot" style={{ background: s.color }} />
            {s.name}
          </label>
        ))}
      </section>
      <section className="ed-card">
        <h4>The main button on a title</h4>
        <label className="ed-check">
          <input type="radio" name="ed-playin" checked={playIn === 'app'} onChange={() => setPlayIn('app')} />
          Open the service's app
        </label>
        <label className="ed-check">
          <input type="radio" name="ed-playin" checked={playIn === 'ekatra'} onChange={() => setPlayIn('ekatra')} />
          Play on its website, here in Ekatra
        </label>
      </section>
      <section className="ed-card">
        <h4>Privacy</h4>
        <p>Lists, likes, history and sign-ins stay on the phone.</p>
        <button type="button" className="ed-link" onClick={onSignOut}>
          Sign out of all services in Ekatra
        </button>
      </section>
      <section className="ed-card">
        <h4>About</h4>
        <p>This product uses the TMDB API but is not endorsed or certified by TMDB. Not affiliated with any streaming service.</p>
      </section>
    </>
  )
}

// ------------------------------------------------------------------ hand-off and web tab

function HandoffSheet({ hand, reduced, onClose }: { hand: Handoff; reduced: boolean; onClose: () => void }) {
  const { title: x, service: s, steps, done } = hand
  const landed = steps[0]
  return (
    <div className="ed-sheet" role="dialog" aria-label={`Opening ${x.name} in ${s.name}`} data-reduced={reduced}>
      {!done ? (
        <div className="ed-hand">
          <p className="ed-eyebrow">Handing off</p>
          <h4>Opening {x.name}</h4>
          <ol className="ed-steps">
            {steps.map((st, i) => (
              <li key={st.label} data-first={i === 0}>
                {st.label}
              </li>
            ))}
          </ol>
          <p className="ed-sub">Ekatra tries these in order and stops at the first that works.</p>
        </div>
      ) : (
        <div className="ed-fakeapp" style={{ '--svc': s.color } as CSSProperties}>
          <p className="ed-fakeapp-name">{s.name}</p>
          <div className="ed-fakeapp-card" style={{ background: art(x.hue, s.color) }}>
            <strong>{x.name}</strong>
            <span>{facts(x)}</span>
          </div>
          <ol className="ed-steps ed-tried" aria-label="What Ekatra tried">
            {steps.map((st, i) => (
              <li key={st.label} data-first={i === 0}>
                {i === 0 ? '✓ ' : ''}
                {st.label}
              </li>
            ))}
          </ol>
          <p className="ed-fakeapp-note">
            {landed.kind === 'page' && landed.exact
              ? `Opened on ${x.name} itself, from its JustWatch link.`
              : landed.kind === 'page'
                ? `Opened ${s.name}'s search for “${x.name}”.`
                : `Opened ${s.name}. “${x.name}” is copied: paste it into its search.`}
          </p>
          <button type="button" className="ed-btn ed-btn-primary" onClick={onClose}>
            Back to Ekatra
          </button>
        </div>
      )}
    </div>
  )
}

function WebTab({
  web,
  setWeb,
  onClose,
  onOpenApp,
  onPick,
}: {
  web: Web
  setWeb: (w: Web) => void
  onClose: () => void
  onOpenApp: (s: DemoService) => void
  onPick: (x: DemoTitle) => void
}) {
  const s = serviceBy(web.service)
  const x = web.title ? titleById(web.title) : undefined
  const catalogue = TITLES.filter((t) => t.services.includes(s.key))
  const mins = x ? (x.kind === 'Film' ? x.length : 48) : 0
  const at = Math.round(web.progress * mins)
  return (
    <div className="ed-web" role="dialog" aria-label={`${s.name} in Ekatra`} style={{ '--svc': s.color } as CSSProperties}>
      <div className="ed-web-bar">
        <button type="button" className="ed-iconbtn" aria-label={`Close ${s.name}`} onClick={onClose}>
          <Icon name="close" />
        </button>
        <span className="ed-dot" style={{ background: s.color }} />
        <span className="ed-web-host">
          <strong>{s.name}</strong>
          <small>{s.host}</small>
        </span>
        <button
          type="button"
          className={`ed-iconbtn${web.desktop ? ' on' : ''}`}
          aria-label={web.desktop ? 'Desktop site (tap for phone site)' : 'Phone site (tap for desktop site)'}
          onClick={() => setWeb({ ...web, desktop: !web.desktop })}
        >
          <Icon name={web.desktop ? 'desktop' : 'phone'} />
        </button>
        <button type="button" className="ed-iconbtn" aria-label={`Open in the ${s.name} app`} onClick={() => onOpenApp(s)}>
          <Icon name="open" />
        </button>
      </div>
      <div className={`ed-site${web.desktop ? ' desktop' : ''}`}>
        <p className="ed-site-logo">{s.name.toUpperCase()}</p>
        {x ? (
          <div className="ed-player">
            <div className="ed-video" style={{ background: art(x.hue, s.color) }}>
              <button
                type="button"
                className="ed-bigplay"
                aria-label={web.playing ? `Pause ${x.name}` : `Play ${x.name}`}
                onClick={() => setWeb({ ...web, playing: !web.playing })}
              >
                <Icon name={web.playing ? 'pause' : 'play'} size={28} />
              </button>
              <span className="ed-drm">Widevine · {web.desktop ? '720p' : '480p'} in a browser</span>
            </div>
            <div className="ed-progress" role="progressbar" aria-label="Playback" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(web.progress * 100)}>
              <span style={{ width: `${web.progress * 100}%` }} />
            </div>
            <p className="ed-time">
              {at} of {mins} min
            </p>
            <h4>{x.name}</h4>
            <p className="ed-sub">{x.overview}</p>
          </div>
        ) : (
          <>
            <p className="ed-sub">Signed in once, kept by Ekatra. Pick something to play.</p>
            <div className="ed-site-grid">
              {catalogue.map((t) => (
                <button key={t.id} type="button" aria-label={`${t.name} on ${s.host}`} onClick={() => onPick(t)} style={{ background: art(t.hue, s.color) }}>
                  {t.name}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
