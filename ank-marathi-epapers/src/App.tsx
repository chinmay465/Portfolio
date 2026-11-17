import { useEffect, useMemo, useRef, useState } from 'react'
import { PaperCard } from './components/PaperCard'
import { CITIES, PAPERS, type CityId, type Lang, type Paper } from './data/papers'
import { t } from './i18n'
import { dayKey, formatDate, matchesQuery, num } from './lib/format'
import { useStoredState } from './lib/storage'

type Theme = 'light' | 'dark'
interface ReadLog {
  day: string
  ids: string[]
}

const prefersDark = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches

function useToday() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const refresh = () => setNow(new Date())
    const id = window.setInterval(refresh, 60_000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])
  return now
}

export default function App() {
  const [lang, setLang] = useStoredState<Lang>('ank:lang', 'mr')
  const [theme, setTheme] = useStoredState<Theme>('ank:theme', prefersDark() ? 'dark' : 'light')
  const [favs, setFavs] = useStoredState<string[]>('ank:favs', [])
  const [city, setCity] = useStoredState<CityId | null>('ank:city', null)
  const [log, setLog] = useStoredState<ReadLog>('ank:read', { day: '', ids: [] })
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  const now = useToday()
  const today = dayKey(now)
  const readIds = log.day === today ? log.ids : []
  const { weekday, date } = formatDate(now, lang)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.lang = lang
  }, [theme, lang])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (e.key === '/' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const visible = useMemo(
    () =>
      PAPERS.filter(
        (p) => matchesQuery([p.name.mr, p.name.en], query) && (!city || p.cities.includes(city)),
      ),
    [query, city],
  )
  const favPapers = visible.filter((p) => favs.includes(p.id))
  const restPapers = visible.filter((p) => !favs.includes(p.id))

  const cityOptions = useMemo(
    () =>
      (Object.keys(CITIES) as CityId[]).sort((a, b) =>
        CITIES[a][lang].localeCompare(CITIES[b][lang], lang === 'mr' ? 'mr' : 'en'),
      ),
    [lang],
  )

  const toggleFav = (id: string) =>
    setFavs((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  const markRead = (id: string) =>
    setLog((prev) => {
      const ids = prev.day === today ? prev.ids : []
      return { day: today, ids: ids.includes(id) ? ids : [...ids, id] }
    })
  const markUnread = (id: string) =>
    setLog((prev) => ({ day: today, ids: (prev.day === today ? prev.ids : []).filter((x) => x !== id) }))

  const renderGrid = (list: Paper[]) => (
    <div className="grid">
      {list.map((p) => (
        <PaperCard
          key={p.id}
          paper={p}
          lang={lang}
          city={city}
          isFav={favs.includes(p.id)}
          isRead={readIds.includes(p.id)}
          onToggleFav={() => toggleFav(p.id)}
          onOpen={() => markRead(p.id)}
          onUnread={() => markUnread(p.id)}
        />
      ))}
    </div>
  )

  const readCount = readIds.length
  const total = PAPERS.length

  return (
    <div className="shell">
      <header className="topbar">
        <a className="brand" href="./" aria-label={t('appName', lang)}>
          <span className="brand__mark" aria-hidden="true">अं</span>
          <span className="brand__name">{t('appName', 'en')}</span>
        </a>
        <div className="topbar__actions">
          <button type="button" className="ghost" onClick={() => setLang(lang === 'mr' ? 'en' : 'mr')}>
            {t('language', lang)}
          </button>
          <button
            type="button"
            className="ghost ghost--icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={t('theme', lang)}
            title={t('theme', lang)}
          >
            {theme === 'dark' ? (
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <circle cx="12" cy="12" r="4.5" fill="currentColor" />
                <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                </g>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z" fill="currentColor" />
              </svg>
            )}
          </button>
        </div>
      </header>

      <main>
        <section className="hero" aria-labelledby="today">
          <p className="hero__tagline">{t('tagline', lang)}</p>
          <h1 id="today" className="hero__date">
            <span className="hero__weekday">{weekday}</span>
            <span className="hero__day">{date}</span>
          </h1>

          <div className="progress" role="status">
            <ol className="progress__dots" aria-hidden="true">
              {PAPERS.map((p) => (
                <li
                  key={p.id}
                  className={readIds.includes(p.id) ? 'is-on' : ''}
                  style={{ ['--hue' as string]: p.hue }}
                  title={p.name[lang]}
                />
              ))}
            </ol>
            <span className="progress__label">
              {readCount === total
                ? t('allRead', lang)
                : t('readCount', lang)(num(readCount, lang), num(total, lang))}
            </span>
          </div>
        </section>

        <section className="filters" aria-label={t('search', lang)}>
          <label className="field field--search">
            <span className="visually-hidden">{t('search', lang)}</span>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('search', lang)}
              autoComplete="off"
            />
            <kbd aria-hidden="true" title={t('shortcut', lang)}>/</kbd>
          </label>

          <label className="field field--city">
            <span className="field__label">{t('city', lang)}</span>
            <select
              value={city ?? ''}
              onChange={(e) => setCity((e.target.value || null) as CityId | null)}
            >
              <option value="">{t('anyCity', lang)}</option>
              {cityOptions.map((c) => (
                <option key={c} value={c}>
                  {CITIES[c][lang]}
                </option>
              ))}
            </select>
          </label>
        </section>

        {visible.length === 0 ? (
          <section className="empty">
            <h2>{t('emptyTitle', lang)}</h2>
            <p>{t('emptyBody', lang)}</p>
            <button
              type="button"
              className="button"
              onClick={() => {
                setQuery('')
                setCity(null)
              }}
            >
              {t('clear', lang)}
            </button>
          </section>
        ) : (
          <>
            {favPapers.length > 0 && (
              <section className="group" aria-labelledby="favs">
                <h2 id="favs" className="group__title">
                  {t('favourites', lang)}
                </h2>
                {renderGrid(favPapers)}
              </section>
            )}
            {restPapers.length > 0 && (
              <section className="group" aria-labelledby="rest">
                <h2 id="rest" className="group__title">
                  {favPapers.length > 0 ? t('others', lang) : t('all', lang)}
                </h2>
                {renderGrid(restPapers)}
              </section>
            )}
          </>
        )}
      </main>

      <footer className="footer">
        <p>{t('footer', lang)}</p>
      </footer>
    </div>
  )
}
