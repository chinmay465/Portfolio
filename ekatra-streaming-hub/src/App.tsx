import { useEffect, useMemo, useRef, useState } from 'react'
import { DEMO_CATALOG } from './data/catalog.ts'
import { PROVIDER_BY_ID } from './data/providers.ts'
import { FeedSkeleton } from './components/FeedSkeleton.tsx'
import { Modal } from './components/Modal.tsx'
import { Onboarding } from './components/Onboarding.tsx'
import { Settings, type Source } from './components/Settings.tsx'
import { TitleCard } from './components/TitleCard.tsx'
import { TitleSheet } from './components/TitleSheet.tsx'
import { matchHistory, readNetflixHistory } from './lib/netflixHistory.ts'
import { recommend, similarTo, type Filter } from './lib/recommend.ts'
import { useStoredState } from './lib/storage.ts'
import { applyReaction } from './lib/signals.ts'
import { normalize } from './lib/text.ts'
import { loadPool, mergeTitles, searchTitles } from './lib/tmdb.ts'
import { EMPTY_SIGNALS, type ProviderId, type Reaction, type Signals, type Title } from './types.ts'

type View = 'home' | 'watchlist' | 'liked' | 'history'

const CHIPS: { label: string; filter: Filter }[] = [
  { label: 'All', filter: {} },
  { label: 'Series', filter: { kind: 'series' } },
  { label: 'Films', filter: { kind: 'film' } },
  ...(['Crime', 'Thriller', 'Comedy', 'Drama', 'Sci-Fi', 'Action', 'Fantasy', 'Mystery', 'History', 'Family'] as const).map(
    (genre) => ({ label: genre, filter: { genre } }),
  ),
]

export default function App() {
  const [theme, setTheme] = useStoredState<'dark' | 'light'>('ekatra:theme', 'dark')
  const [services, setServices] = useStoredState<ProviderId[]>('ekatra:services', [])
  const [onboarded, setOnboarded] = useStoredState('ekatra:onboarded', false)
  const [signals, setSignals] = useStoredState<Signals>('ekatra:signals', EMPTY_SIGNALS)
  const [library, setLibrary] = useStoredState<Record<string, Title>>('ekatra:library', {})
  const [source, setSource] = useStoredState<Source>('ekatra:source', { mode: 'demo' })

  const [live, setLive] = useState<{ sig: string; titles: Title[] } | null>(null)
  const [liveError, setLiveError] = useState<{ sig: string; message: string } | null>(null)
  const [view, setView] = useState<View>('home')
  const [chip, setChip] = useState(0)
  const [only, setOnly] = useState<ProviderId | null>(null)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<{ q: string; titles: Title[] } | null>(null)
  const [open, setOpen] = useState<Title | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const tmdbKey = source.mode === 'tmdb' ? source.key : undefined
  const prefix = tmdbKey ? 'tmdb:' : 'demo:'
  const liveSig = `${tmdbKey}|${[...services].sort().join(',')}`

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(id)
  }, [toast])

  // Live catalog: reload when the key or the chosen services change.
  useEffect(() => {
    if (!tmdbKey) return
    let cancelled = false
    const sig = `${tmdbKey}|${[...services].sort().join(',')}`
    loadPool(tmdbKey, services)
      .then((titles) => !cancelled && setLive({ sig, titles }))
      .catch((e: Error) => !cancelled && setLiveError({ sig, message: e.message }))
    return () => {
      cancelled = true
    }
  }, [tmdbKey, services])

  const liveReady = live?.sig === liveSig
  const error = tmdbKey && liveError?.sig === liveSig ? liveError.message : null
  const loading = Boolean(tmdbKey) && !liveReady && !error

  const pool = useMemo(() => {
    const base = tmdbKey ? (liveReady ? live!.titles : []) : DEMO_CATALOG
    const saved = Object.values(library).filter((t) => t.id.startsWith(prefix))
    return mergeTitles([...base, ...saved])
  }, [tmdbKey, liveReady, live, library, prefix])

  const byId = useMemo(() => new Map(pool.map((t) => [t.id, t])), [pool])

  // Search: local for the demo, TMDB for live (debounced).
  const q = query.trim()
  useEffect(() => {
    if (!tmdbKey || q.length < 2) return
    let cancelled = false
    const id = setTimeout(() => {
      searchTitles(tmdbKey, q)
        .then((titles) => !cancelled && setHits({ q, titles }))
        .catch(() => !cancelled && setHits({ q, titles: [] }))
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [q, tmdbKey])

  // Live search is in flight from the first keystroke past one letter until results for this exact query arrive.
  const searching = Boolean(tmdbKey) && q.length >= 2 && hits?.q !== q
  const searchResults = useMemo(() => {
    if (!q) return null
    if (tmdbKey) return hits?.q === q ? hits.titles : []
    const n = normalize(q)
    return pool.filter(
      (t) =>
        normalize(t.name).includes(n) ||
        t.genres.some((g) => normalize(g) === n) ||
        (t.tags ?? []).some((tag) => normalize(tag).includes(n)),
    )
  }, [q, tmdbKey, hits, pool])

  const scope = useMemo(() => (only ? [only] : services), [only, services])
  const feed = useMemo(() => recommend(pool, signals, scope, CHIPS[chip].filter, 48), [pool, signals, scope, chip])

  const seen = useMemo(
    () => [...signals.liked, ...signals.disliked, ...signals.watchlist, ...Object.keys(signals.watched)],
    [signals],
  )
  const seed = [...signals.liked].reverse().map((id) => byId.get(id)).find(Boolean)
  const because = seed && chip === 0 ? similarTo(seed, pool, scope, seen, 8) : []
  const shelfIds = new Set(because.map((t) => t.id))
  const mainFeed = feed.filter((p) => !shelfIds.has(p.title.id))
  const watchlist = signals.watchlist.map((id) => byId.get(id)).filter((t): t is Title => Boolean(t))

  const react = (t: Title, r: Reaction) => {
    setSignals((s) => applyReaction(s, t.id, r))
    setLibrary((lib) => ({ ...lib, [t.id]: t }))
  }

  const importHistory = async (file: File) => {
    const rows = readNetflixHistory(await file.text())
    if (rows.length === 0) {
      setToast('That file had no viewing history rows.')
      return
    }
    const { matched, unmatched } = matchHistory(rows, pool)
    const found: Title[] = Object.keys(matched).map((id) => byId.get(id)!)

    // Live mode: look up the most-watched shows that weren't in the pool.
    if (tmdbKey) {
      const lookups = await Promise.all(
        unmatched.slice(0, 15).map(async ({ name, plays }) => {
          const results = await searchTitles(tmdbKey, name, 3).catch(() => [])
          const hit = results.find((t) => normalize(t.name) === normalize(name)) ?? results[0]
          return hit ? { hit, plays } : null
        }),
      )
      for (const l of lookups) {
        if (!l) continue
        matched[l.hit.id] = (matched[l.hit.id] ?? 0) + l.plays
        found.push(l.hit)
      }
    }

    setSignals((s) => {
      const watched = { ...s.watched }
      for (const [id, plays] of Object.entries(matched)) watched[id] = (watched[id] ?? 0) + plays
      return { ...s, watched }
    })
    setLibrary((lib) => ({ ...lib, ...Object.fromEntries(found.map((t) => [t.id, t])) }))
    setSettingsOpen(false)
    setView('home')
    const titles = new Set(found.map((t) => t.id)).size
    setToast(
      titles
        ? `Imported ${rows.length} entries: matched ${titles} title${titles === 1 ? '' : 's'}. Your feed is updated.`
        : `Read ${rows.length} entries but none are in this catalog. Try the live TMDB catalog.`,
    )
  }

  const openTitle = (t: Title) => setOpen(t)
  const goHome = () => {
    setView('home')
    setQuery('')
  }

  const list = (ids: string[]) => ids.map((id) => byId.get(id)).filter((t): t is Title => Boolean(t))
  const counts = {
    watchlist: signals.watchlist.length,
    liked: signals.liked.length,
    history: Object.keys(signals.watched).length,
  }
  const feedTitle = signals.liked.length || counts.history ? 'Recommended for you' : 'Popular on your services'

  return (
    <div className="app">
      <header className="top">
        <button type="button" className="logo" onClick={goHome} aria-label="Ekatra home">
          <span className="logo__mark" aria-hidden="true">
            ▶
          </span>
          <span className="logo__word">ekatra</span>
        </button>
        <form className="search" role="search" onSubmit={(e) => e.preventDefault()}>
          <input
            ref={searchRef}
            type="search"
            placeholder="Search every service"
            aria-label="Search every service"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd aria-hidden="true">/</kbd>
        </form>
        <div className="top__actions">
          <button type="button" className="source-pill" onClick={() => setSettingsOpen(true)}>
            <span className={`dot${tmdbKey ? ' dot--live' : ''}`} aria-hidden="true" />
            {tmdbKey ? 'Live · TMDB' : 'Demo catalog'}
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
          <button type="button" className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Settings">
            ⚙
          </button>
        </div>
      </header>

      <div className="layout">
        <nav className="side" aria-label="Library">
          {(
            [
              ['home', 'Home', '⌂'],
              ['watchlist', 'Watchlist', '＋'],
              ['liked', 'Liked', '👍'],
              ['history', 'History', '↺'],
            ] as const
          ).map(([v, label, icon]) => (
            <button
              key={v}
              type="button"
              className="side__item"
              aria-current={view === v && !q ? 'page' : undefined}
              onClick={() => {
                setView(v)
                setQuery('')
              }}
            >
              <span className="side__icon" aria-hidden="true">
                {icon}
              </span>
              {label}
              {v !== 'home' && counts[v] > 0 && <span className="side__count">{counts[v]}</span>}
            </button>
          ))}
          <hr />
          <p className="side__heading">Your services</p>
          {services.length === 0 && (
            <button type="button" className="side__item side__item--muted" onClick={() => setSettingsOpen(true)}>
              Pick services
            </button>
          )}
          {services.map((id) => (
            <button
              key={id}
              type="button"
              className="side__item"
              aria-pressed={only === id}
              onClick={() => {
                setOnly(only === id ? null : id)
                setView('home')
                setQuery('')
              }}
            >
              <span className="avatar avatar--sm" style={{ '--tint': PROVIDER_BY_ID[id].color } as React.CSSProperties}>
                {PROVIDER_BY_ID[id].name[0]}
              </span>
              {PROVIDER_BY_ID[id].name}
            </button>
          ))}
        </nav>

        <main className="main" id="main">
          {error && (
            <div className="banner banner--error" role="alert">
              {error} Check the key in settings, or switch back to the demo catalog.
              <button type="button" className="ghost" onClick={() => setSource({ mode: 'demo' })}>
                Use demo
              </button>
            </div>
          )}

          {searchResults !== null ? (
            <section aria-live="polite">
              <h2 className="section-title">
                {searching
                  ? `Searching for “${q}”…`
                  : searchResults.length
                    ? `Results for “${q}”`
                    : q.length < 2 && tmdbKey
                      ? 'Keep typing…'
                      : `Nothing for “${q}”`}
              </h2>
              {searching ? (
                <FeedSkeleton count={8} />
              ) : (
                <div className="grid">
                  {searchResults.map((t) => (
                    <TitleCard key={t.id} title={t} services={services} onOpen={openTitle} />
                  ))}
                </div>
              )}
            </section>
          ) : view === 'home' ? (
            <>
              <div className="chips" role="tablist" aria-label="Filter">
                {CHIPS.map((c, i) => (
                  <button key={c.label} type="button" role="tab" aria-selected={chip === i} className="chip" onClick={() => setChip(i)}>
                    {c.label}
                  </button>
                ))}
              </div>

              {only && (
                <p className="scope">
                  Showing only {PROVIDER_BY_ID[only].name}.{' '}
                  <button type="button" className="text-link" onClick={() => setOnly(null)}>
                    Show all services
                  </button>
                </p>
              )}

              {loading && (
                <section>
                  <h2 className="section-title">
                    {feedTitle}
                  </h2>
                  <FeedSkeleton label="Loading the live catalog from TMDB…" />
                </section>
              )}

              {!loading && seed && because.length > 0 && (
                <section className="shelf">
                  <h2 className="section-title">Because you liked {seed.name.split(':')[0]}</h2>
                  <div className="shelf__row">
                    {because.map((t) => (
                      <TitleCard key={t.id} title={t} services={services} onOpen={openTitle} />
                    ))}
                  </div>
                </section>
              )}

              {!loading && chip === 0 && watchlist.length > 0 && (
                <section className="shelf">
                  <h2 className="section-title">Your watchlist</h2>
                  <div className="shelf__row">
                    {watchlist.map((t) => (
                      <TitleCard key={t.id} title={t} services={services} onOpen={openTitle} />
                    ))}
                  </div>
                </section>
              )}

              {!loading && (
                <section>
                  <h2 className="section-title">
                    {feedTitle}
                  </h2>
                  {mainFeed.length === 0 ? (
                    <p className="empty">Nothing here yet. Try another filter or add services in settings.</p>
                  ) : (
                    <div className="grid">
                      {mainFeed.map((p) => (
                        <TitleCard key={p.title.id} title={p.title} services={services} reason={p.reason} onOpen={openTitle} />
                      ))}
                    </div>
                  )}
                </section>
              )}
            </>
          ) : (
            <section>
              <h2 className="section-title">{{ watchlist: 'Watchlist', liked: 'Liked', history: 'History' }[view]}</h2>
              {(() => {
                const items =
                  view === 'watchlist'
                    ? list([...signals.watchlist].reverse())
                    : view === 'liked'
                      ? list([...signals.liked].reverse())
                      : list(Object.entries(signals.watched).sort((a, b) => b[1] - a[1]).map(([id]) => id))
                if (items.length === 0) {
                  return (
                    <p className="empty">
                      {view === 'history'
                        ? 'Mark titles as watched, or import your Netflix viewing history from settings.'
                        : `Nothing ${view === 'liked' ? 'liked' : 'saved'} yet. Open any title to add it.`}
                    </p>
                  )
                }
                return (
                  <div className="grid">
                    {items.map((t) => (
                      <TitleCard
                        key={t.id}
                        title={t}
                        services={services}
                        onOpen={openTitle}
                        note={
                          view === 'history'
                            ? `${signals.watched[t.id]} ${signals.watched[t.id] === 1 ? 'view' : 'episodes or views'}`
                            : undefined
                        }
                      />
                    ))}
                  </div>
                )
              })()}
            </section>
          )}

          <footer className="foot">
            Ekatra doesn’t host or play anything. Each title opens on its own service.
            {tmdbKey && ' Catalog from TMDB; streaming availability by JustWatch. This product uses the TMDB API but is not endorsed or certified by TMDB.'}
          </footer>
        </main>
      </div>

      <Modal open={open !== null} onClose={() => setOpen(null)} label={open?.name ?? 'Title'} className="modal--sheet">
        {open && (
          <TitleSheet
            key={open.id}
            title={open}
            pool={pool}
            services={services}
            signals={signals}
            tmdbKey={tmdbKey}
            onReact={react}
            onOpen={openTitle}
          />
        )}
      </Modal>

      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} label="Settings">
        <Settings
          services={services}
          onServices={setServices}
          source={source}
          onSource={(s) => {
            setSource(s)
            setSettingsOpen(false)
            setToast(s.mode === 'tmdb' ? 'Loading the live catalog from TMDB…' : 'Switched to the demo catalog.')
          }}
          onImport={importHistory}
          onReset={() => {
            setSignals(EMPTY_SIGNALS)
            setLibrary({})
            setSettingsOpen(false)
            setToast('Cleared.')
          }}
        />
      </Modal>

      <Modal open={!onboarded} onClose={() => setOnboarded(true)} label="Welcome">
        <Onboarding
          pool={pool}
          services={services}
          onServices={setServices}
          onDone={(liked) => {
            setSignals((s) => ({ ...s, liked: [...new Set([...s.liked, ...liked.map((t) => t.id)])] }))
            setLibrary((lib) => ({ ...lib, ...Object.fromEntries(liked.map((t) => [t.id, t])) }))
            setOnboarded(true)
          }}
        />
      </Modal>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}
