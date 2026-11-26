import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { fetchStats, needsToken, percent, savedToken, saveToken, Unauthorized } from './api.ts'
import type { Ranked, Stats } from './api.ts'
import { DailyChart } from './DailyChart.tsx'

type View = { kind: 'loading' } | { kind: 'token'; wrong: boolean } | { kind: 'error'; message: string } | { kind: 'ready'; stats: Stats }

const RANGES = [7, 30, 90] as const

async function loadView(days: number, token: string): Promise<View> {
  try {
    if (!token && (await needsToken())) return { kind: 'token', wrong: false }
    return { kind: 'ready', stats: await fetchStats(days, token) }
  } catch (err) {
    if (err instanceof Unauthorized) {
      saveToken('')
      return { kind: 'token', wrong: Boolean(token) }
    }
    return { kind: 'error', message: err instanceof Error ? err.message : 'Something went wrong' }
  }
}

export default function App() {
  const [days, setDays] = useState<number>(30)
  const [token, setToken] = useState(savedToken)
  const [view, setView] = useState<View>({ kind: 'loading' })
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(() => loadView(days, token).then(setView), [days, token])

  useEffect(() => {
    let live = true
    const run = () => loadView(days, token).then((v) => live && setView(v))
    void run()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void run()
    }, 60_000)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [days, token])

  function refresh() {
    setRefreshing(true)
    void load().finally(() => setRefreshing(false))
  }

  function signIn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const value = String(new FormData(e.currentTarget).get('token') ?? '').trim()
    if (!value) return
    saveToken(value)
    setToken(value)
  }

  function signOut() {
    saveToken('')
    setToken('')
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <img src="./icon.svg" alt="" width="28" height="28" />
          <div>
            <h1>Darshak</h1>
            <p className="muted">Unique visitors to chinmay-upare.onrender.com</p>
          </div>
        </div>
        {view.kind === 'ready' && (
          <div className="controls">
            <div className="seg" role="group" aria-label="Range">
              {RANGES.map((r) => (
                <button key={r} type="button" aria-pressed={days === r} onClick={() => setDays(r)}>
                  {r}d
                </button>
              ))}
            </div>
            <button type="button" className="ghost" onClick={refresh} disabled={refreshing}>
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
            {token && (
              <button type="button" className="ghost" onClick={signOut}>
                Lock
              </button>
            )}
          </div>
        )}
      </header>

      <main>
        {view.kind === 'loading' && <p className="muted center">Loading… a sleeping free server can take up to a minute to wake.</p>}

        {view.kind === 'error' && (
          <div className="card center">
            <p>{view.message}</p>
            <button type="button" onClick={refresh}>
              Try again
            </button>
          </div>
        )}

        {view.kind === 'token' && (
          <form className="card lock" onSubmit={signIn}>
            <h2>Enter the stats token</h2>
            <p className="muted">It's the DASHBOARD_TOKEN value on the Render service. This browser remembers it.</p>
            <input name="token" type="password" autoComplete="current-password" aria-label="Stats token" autoFocus />
            {view.wrong && <p className="warn">That token didn't work.</p>}
            <button type="submit">Open dashboard</button>
          </form>
        )}

        {view.kind === 'ready' && <Dashboard stats={view.stats} />}
      </main>
    </div>
  )
}

function Dashboard({ stats }: { stats: Stats }) {
  const inRange = stats.daily.reduce((sum, d) => sum + d.visitors, 0)
  return (
    <>
      {stats.storage === 'pglite' && (
        <p className="banner">
          No DATABASE_URL set: visitors are kept on the server's own disk, which Render wipes on every deploy. Add a Postgres URL
          to keep them.
        </p>
      )}

      <section className="hero card">
        <p className="muted">People who have visited</p>
        <p className="big">{stats.total.toLocaleString('en-IN')}</p>
        <p className="muted">
          {inRange.toLocaleString('en-IN')} new in the last {stats.days} days · {percent(stats.returning, stats.total)} came back
        </p>
      </section>

      <section className="tiles">
        <Tile label="New today" value={stats.today} />
        <Tile label="Seen today" value={stats.activeToday} hint="new and returning" />
        <Tile label="New, 7 days" value={stats.last7} />
        <Tile label="New, 30 days" value={stats.last30} />
      </section>

      <section className="card">
        <DailyChart daily={stats.daily} />
      </section>

      <section className="lists">
        <List title="Landing page" rows={stats.pages} />
        <List title="Came from" rows={stats.referrers} />
        <List title="Device" rows={stats.devices} />
      </section>

      <p className="muted foot">
        One entry per browser: each gets a random id, so moving between pages or coming back never counts twice. Days are IST.
      </p>
    </>
  )
}

function Tile({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="card tile">
      <p className="muted">{label}</p>
      <p className="num">{value.toLocaleString('en-IN')}</p>
      {hint && <p className="hint">{hint}</p>}
    </div>
  )
}

function List({ title, rows }: { title: string; rows: Ranked[] }) {
  const max = Math.max(1, ...rows.map((r) => r.visitors))
  return (
    <div className="card list">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p className="muted">No visitors in this range yet.</p>
      ) : (
        <ul>
          {rows.map((r) => (
            <li key={r.label}>
              <span className="meter" style={{ width: `${(r.visitors / max) * 100}%` }} />
              <span className="label">{r.label}</span>
              <span className="count">{r.visitors}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
