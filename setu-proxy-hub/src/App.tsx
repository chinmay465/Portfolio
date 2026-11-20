import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import ApiView from './components/ApiView.tsx'
import BrowseView from './components/BrowseView.tsx'
import type { BrowseState } from './components/BrowseView.tsx'
import PoolView from './components/PoolView.tsx'
import TunnelView from './components/TunnelView.tsx'
import { ApiError, fetchReader, getConfig, getPool, search, setToken } from './lib/api.ts'
import { asUrl } from './lib/format.ts'
import type { Config, PoolSnapshot } from './lib/types.ts'

type Tab = 'browse' | 'pool' | 'tunnel' | 'api'

export default function App() {
  const [config, setConfig] = useState<Config | null>(null)
  const [pool, setPool] = useState<PoolSnapshot | null>(null)
  const [tab, setTab] = useState<Tab>('browse')
  const [input, setInput] = useState('')
  const [engine, setEngine] = useState('')
  const [sticky, setSticky] = useState(true)
  const [state, setState] = useState<BrowseState>({ kind: 'idle' })
  const [history, setHistory] = useState<BrowseState[]>([])
  const [needToken, setNeedToken] = useState(false)
  const [tokenDraft, setTokenDraft] = useState('')

  const loadPool = useCallback(async () => {
    try {
      setPool(await getPool())
      setNeedToken(false)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setNeedToken(true)
    }
  }, [])

  useEffect(() => {
    getConfig().then(setConfig).catch(() => setConfig(null))
    const first = setTimeout(() => void loadPool(), 0)
    const t = setInterval(() => void loadPool(), 3000)
    return () => {
      clearTimeout(first)
      clearInterval(t)
    }
  }, [loadPool])

  const go = useCallback(
    async (next: { url?: string; query?: string }, push = true) => {
      setTab('browse')
      if (push && (state.kind === 'results' || state.kind === 'page')) setHistory((h) => [...h.slice(-30), state])
      if (next.url) {
        setInput(next.url)
        setState({ kind: 'loading', label: `Fetching ${next.url}` })
        try {
          const r = await fetchReader(next.url, sticky)
          setState({ kind: 'page', url: next.url, ...r })
        } catch (e) {
          setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
        }
      } else if (next.query) {
        setState({ kind: 'loading', label: `Searching “${next.query}”` })
        try {
          setState({ kind: 'results', data: await search(next.query, engine || undefined) })
        } catch (e) {
          setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
        }
      }
    },
    [engine, state, sticky],
  )

  function submit(e: FormEvent) {
    e.preventDefault()
    const v = input.trim()
    if (!v) return
    const url = asUrl(v)
    void go(url ? { url } : { query: v })
  }

  function back() {
    const prev = history[history.length - 1]
    if (!prev) return
    setHistory((h) => h.slice(0, -1))
    setState(prev)
    if (prev.kind === 'page') setInput(prev.url)
    if (prev.kind === 'results') setInput(prev.data.query)
  }

  function saveToken(e: FormEvent) {
    e.preventDefault()
    setToken(tokenDraft.trim())
    setTokenDraft('')
    void loadPool()
  }

  const live = pool?.alive ?? 0
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className={`dot ${live ? 'live' : ''}`} />
          <h1>
            सेतु · Setu <span className="sub">free-proxy hub</span>
          </h1>
        </div>
        <div className="pill" title="Validated proxies ready to use">
          {pool?.refreshing ? (
            <>
              checking {pool.progress.checked}/{pool.progress.total} · <strong>{live}</strong> live
            </>
          ) : (
            <>
              <strong>{live}</strong> proxies live
            </>
          )}
        </div>
      </header>

      {config?.locked && (
        <p className="banner danger">This is a public deployment without SETU_TOKEN, so fetching and search are disabled. Set SETU_TOKEN on the server to enable them.</p>
      )}
      {needToken && (
        <form className="banner" onSubmit={saveToken}>
          <span>This Setu needs an access token.</span>
          <input type="password" placeholder="SETU_TOKEN" value={tokenDraft} onChange={(e) => setTokenDraft(e.target.value)} />
          <button className="btn primary small" type="submit">
            Save
          </button>
        </form>
      )}

      <form className="omnibox" onSubmit={submit}>
        <button type="button" className="btn icon" onClick={back} disabled={!history.length} aria-label="Back">
          ←
        </button>
        <input
          type="text"
          placeholder="Search the web or enter a URL — everything goes through a free proxy"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoFocus
        />
        <select value={engine} onChange={(e) => setEngine(e.target.value)} aria-label="Search engine">
          <option value="">auto</option>
          {(config?.engines ?? []).map((en) => (
            <option key={en} value={en}>
              {en === 'google' ? 'google (via Startpage)' : en}
            </option>
          ))}
        </select>
        <button className="btn primary" type="submit">
          Go
        </button>
      </form>

      <nav className="tabs">
        {(['browse', 'pool', 'tunnel', 'api'] as Tab[]).map((t) => (
          <button key={t} type="button" className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t === 'browse' ? 'Browse' : t === 'pool' ? `Pool (${live})` : t === 'tunnel' ? 'Tunnel (VPN-like)' : 'Use from other apps'}
          </button>
        ))}
        {tab === 'browse' && (
          <label className="check right" title="Keep the same proxy per site for 10 minutes">
            <input type="checkbox" checked={sticky} onChange={(e) => setSticky(e.target.checked)} />
            same IP per site
          </label>
        )}
      </nav>

      <main className="content">
        {tab === 'browse' && <BrowseView state={state} onOpen={(url) => void go({ url })} />}
        {tab === 'pool' && <PoolView pool={pool} onRefreshed={setPool} />}
        {tab === 'tunnel' && <TunnelView />}
        {tab === 'api' && <ApiView authRequired={Boolean(config?.authRequired)} />}
      </main>
    </div>
  )
}
