import { hostOf } from '../lib/format.ts'
import type { FetchMeta, ReaderPage, SearchResponse } from '../lib/types.ts'

export type BrowseState =
  | { kind: 'idle' }
  | { kind: 'loading'; label: string }
  | { kind: 'error'; message: string }
  | { kind: 'results'; data: SearchResponse }
  | { kind: 'page'; url: string; meta: FetchMeta; page: ReaderPage }

interface Props {
  state: BrowseState
  onOpen: (url: string) => void
}

function Via({ proxy, exitIp, ms, extra }: { proxy: string; exitIp: string; ms: number; extra?: string }) {
  return (
    <p className="via">
      via <code>{proxy}</code> · seen as <code>{exitIp || 'unknown'}</code> · {ms} ms{extra ? ` · ${extra}` : ''}
    </p>
  )
}

export default function BrowseView({ state, onOpen }: Props) {
  if (state.kind === 'idle') {
    return (
      <section className="panel empty-state">
        <h2>Search or open any page through a free proxy</h2>
        <p>
          Setu fetches the page from a validated public proxy and shows it here as a clean, script-free reader view. Links
          stay inside Setu, so you keep browsing through the proxy.
        </p>
        <p className="muted">Don’t sign in to anything here — free proxies are run by strangers. See the Tunnel tab for safety notes.</p>
      </section>
    )
  }
  if (state.kind === 'loading') return <section className="panel empty-state"><p className="spinner">{state.label}…</p></section>
  if (state.kind === 'error') return <section className="panel empty-state"><p className="error">{state.message}</p></section>

  if (state.kind === 'results') {
    const d = state.data
    return (
      <section className="panel">
        <Via proxy={d.proxy} exitIp={d.exitIp} ms={d.ms} extra={`${d.engine === 'google' ? 'Google results via Startpage' : d.engine}${d.tried.length ? ` (after ${d.tried.map((t) => t.engine).join(', ')} failed)` : ''}`} />
        <ol className="results">
          {d.results.map((r) => (
            <li key={r.url}>
              <button type="button" className="link-title" onClick={() => onOpen(r.url)}>
                {r.title || r.url}
              </button>
              <span className="host">{hostOf(r.url)}</span>
              {r.snippet && <p>{r.snippet}</p>}
            </li>
          ))}
        </ol>
      </section>
    )
  }

  const { meta, page, url } = state
  return (
    <section className="panel reader">
      <Via proxy={meta.proxy} exitIp={meta.exitIp} ms={meta.ms} extra={`HTTP ${meta.status}${meta.attempts > 1 ? ` · ${meta.attempts} tries` : ''}`} />
      <h1>{page.title || hostOf(meta.finalUrl)}</h1>
      <p className="host">
        {meta.finalUrl}{' '}
        <a href={url} target="_blank" rel="noreferrer noopener" title="Opens directly in your browser — NOT through the proxy">
          open directly ↗
        </a>
      </p>
      {page.description && <p className="lede">{page.description}</p>}
      <article>
        {page.blocks.map((b, i) =>
          b.kind === 'h' ? <h3 key={i}>{b.text}</h3> : b.kind === 'pre' ? <pre key={i}>{b.text}</pre> : b.kind === 'li' ? <p key={i} className="li">• {b.text}</p> : <p key={i}>{b.text}</p>,
        )}
      </article>
      {page.links.length > 0 && (
        <details className="links">
          <summary>{page.links.length} links on this page</summary>
          <ul>
            {page.links.map((l) => (
              <li key={l.href}>
                <button type="button" className="link" onClick={() => onOpen(l.href)}>
                  {l.text}
                </button>
                <span className="host">{hostOf(l.href)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
