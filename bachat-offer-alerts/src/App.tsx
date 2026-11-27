import { useCallback, useEffect, useState } from 'react'
import { isNow } from '../shared/deal.ts'
import { isExtraordinary } from '../shared/discount.ts'
import type { Settings } from '../shared/types.ts'
import AlertsView from './AlertsView.tsx'
import { getFeed, loadSettings, saveSettings, scanNow } from './api.ts'
import type { Feed } from './api.ts'
import FeedView from './FeedView.tsx'
import { ago } from './format.ts'
import SourcesView from './SourcesView.tsx'

type Tab = 'offers' | 'alerts' | 'sources'

const icons = {
  offers: <path d="M3 12 12 3h8a1 1 0 0 1 1 1v8l-9 9a1.5 1.5 0 0 1-2 0l-7-7a1.5 1.5 0 0 1 0-2ZM16.5 7.5h.01" />,
  alerts: <path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0" />,
  sources: <path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16M5 19h.01" />,
}
const Icon = ({ name }: { name: keyof typeof icons }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {icons[name]}
  </svg>
)

export default function App() {
  const [tab, setTab] = useState<Tab>('offers')
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [feed, setFeed] = useState<Feed | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async () => {
    try {
      setFeed(await getFeed())
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [])

  const check = useCallback(async () => {
    setBusy(true)
    try {
      await scanNow()
      await load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
      setNow(Date.now())
    }
  }, [load])

  useEffect(() => {
    // Show what's stored straight away, then check the sources if the last check is stale.
    void load().then(() => undefined)
    const tick = setInterval(() => setNow(Date.now()), 30_000)
    const poll = setInterval(() => void load(), 120_000)
    const onMsg = (e: MessageEvent) => e.data?.type === 'refresh' && void load()
    navigator.serviceWorker?.addEventListener('message', onMsg)
    return () => {
      clearInterval(tick)
      clearInterval(poll)
      navigator.serviceWorker?.removeEventListener('message', onMsg)
    }
  }, [load])

  useEffect(() => {
    if (feed && (!feed.lastScan || Date.now() - Date.parse(feed.lastScan.at) > 8 * 60_000) && !busy) void check()
    // Only once the first feed arrives.
  }, [feed === null])

  const save = async (s: Settings) => setSettings(await saveSettings(s))
  const wowNow = (feed?.deals ?? []).some((d) => isNow(d, settings.nowHours, now) && isExtraordinary(d, settings.extraordinary.threshold))
  const last = feed?.lastScan?.at

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <img src="/icon-192.png" alt="" />
          <div>
            <h1>
              Bachat<span>बचत</span>
            </h1>
            <p>{last ? `Checked ${ago(last, now)}` : 'Offer alerts'}</p>
          </div>
        </div>
        <button className="check" onClick={() => void check()} aria-busy={busy} disabled={busy}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" />
          </svg>
          {busy ? 'Checking…' : 'Check now'}
        </button>
      </header>

      {error && <div className="error" role="alert">Couldn’t reach Bachat’s server: {error}</div>}

      {tab === 'offers' && <FeedView deals={feed?.deals ?? []} settings={settings} now={now} loading={!feed || busy} />}
      {tab === 'alerts' && <AlertsView settings={settings} onSave={save} />}
      {tab === 'sources' && <SourcesView status={feed?.sources ?? []} settings={settings} now={now} onSave={save} />}

      <nav className="tabs" role="tablist" aria-label="Sections">
        {(['offers', 'alerts', 'sources'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            <Icon name={t} />
            {t === 'offers' ? 'Offers' : t === 'alerts' ? 'Alerts' : 'Sources'}
            {t === 'offers' && wowNow && tab !== 'offers' && <span className="dot" aria-label="extraordinary deal live" />}
          </button>
        ))}
      </nav>
    </div>
  )
}
