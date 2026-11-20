import { useState } from 'react'
import { refreshPool } from '../lib/api.ts'
import { ago } from '../lib/format.ts'
import type { PoolSnapshot } from '../lib/types.ts'

interface Props {
  pool: PoolSnapshot | null
  onRefreshed: (p: PoolSnapshot) => void
}

export default function PoolView({ pool, onRefreshed }: Props) {
  const [err, setErr] = useState('')
  if (!pool) return <section className="panel empty-state"><p className="muted">Loading pool…</p></section>

  async function refresh() {
    setErr('')
    try {
      onRefreshed(await refreshPool())
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="grid">
      <section className="panel">
        <div className="panel-head">
          <h2>Pool</h2>
          <button className="btn small" type="button" onClick={() => void refresh()} disabled={pool.refreshing}>
            {pool.refreshing ? 'Checking…' : 'Refresh now'}
          </button>
        </div>
        <dl className="stats">
          <div><dt>Live</dt><dd>{pool.alive}</dd></div>
          <div><dt>Last check</dt><dd>{ago(pool.lastRefreshAt)}</dd></div>
          <div title="Caught intercepting HTTPS with a fake certificate — never used again"><dt>Banned</dt><dd>{pool.banned}</dd></div>
          <div><dt>Progress</dt><dd>{pool.refreshing ? `${pool.progress.checked}/${pool.progress.total}` : 'idle'}</dd></div>
        </dl>
        {err && <p className="error">{err}</p>}
        <h3 className="mini">Sources</h3>
        <table className="table">
          <tbody>
            {pool.sources.map((s) => (
              <tr key={s.name}>
                <td>{s.name}</td>
                <td className="num">{s.error ? <span className="error">{s.error}</span> : `${s.count} listed`}</td>
              </tr>
            ))}
            {!pool.sources.length && (
              <tr><td className="muted">Fetching lists…</td></tr>
            )}
          </tbody>
        </table>
        <p className="muted small">
          Each listed proxy must tunnel HTTPS to a judge, return a valid response and hide your IP before it joins the pool.
          Typically only 2–10% of a free list passes. Proxies that fail 3 times in a row are dropped, any proxy caught showing a fake HTTPS certificate is banned for good, and the pool re-checks every 15 minutes.
        </p>
      </section>

      <section className="panel">
        <h2>Fastest proxies</h2>
        <table className="table">
          <thead>
            <tr><th>Proxy</th><th>Exit IP</th><th className="num">Latency</th><th className="num">OK / fail</th><th>Listed by</th><th>Used</th></tr>
          </thead>
          <tbody>
            {pool.proxies.map((p) => (
              <tr key={p.id}>
                <td><code>{p.address}</code></td>
                <td><code>{p.exitIp || '—'}</code></td>
                <td className="num">{p.latencyMs} ms</td>
                <td className="num">{p.successes} / {p.failures}</td>
                <td>{p.pinned ? 'yours (pinned)' : p.sources.join(', ')}</td>
                <td>{ago(p.lastUsedAt)}</td>
              </tr>
            ))}
            {!pool.proxies.length && (
              <tr><td colSpan={6} className="muted">{pool.refreshing ? 'Validating proxies — the first ones usually appear within 10–20 seconds.' : 'No live proxies. Hit Refresh.'}</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}
