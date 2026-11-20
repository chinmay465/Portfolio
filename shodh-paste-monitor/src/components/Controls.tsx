import { useEffect, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { getCapabilities } from '../lib/api.ts'
import type { Mode, SourceSpec, StartBody } from '../lib/types.ts'

interface Props {
  running: boolean
  notice: string
  onStart: (body: StartBody) => void
  onStop: () => void
}

export default function Controls({ running, notice, onStart, onStop }: Props) {
  const [keywords, setKeywords] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [mode, setMode] = useState<Mode>('any')
  const [wholeWord, setWholeWord] = useState(false)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [intervalSec, setIntervalSec] = useState(8)
  const [useMock, setUseMock] = useState(true)
  const [usePastebin, setUsePastebin] = useState(false)
  const [htmlName, setHtmlName] = useState('')
  const [htmlArchive, setHtmlArchive] = useState('')
  const [htmlLink, setHtmlLink] = useState('')
  const [htmlContent, setHtmlContent] = useState('')
  const [htmlViaSetu, setHtmlViaSetu] = useState(false)
  const [setuAvailable, setSetuAvailable] = useState(false)
  const [localNotice, setLocalNotice] = useState('')

  useEffect(() => {
    getCapabilities()
      .then((c) => setSetuAvailable(c.setu))
      .catch(() => setSetuAvailable(false))
  }, [])

  function addKeyword(raw: string) {
    const parts = raw.split(',').map((s) => s.trim()).filter(Boolean)
    if (!parts.length) return
    setKeywords((prev) => {
      const next = [...prev]
      for (const p of parts) {
        if (!next.some((k) => k.toLowerCase() === p.toLowerCase())) next.push(p)
      }
      return next
    })
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addKeyword(draft)
      setDraft('')
    } else if (e.key === 'Backspace' && !draft && keywords.length) {
      setKeywords((prev) => prev.slice(0, -1))
    }
  }

  function collectSources(): SourceSpec[] {
    const sources: SourceSpec[] = []
    if (useMock) sources.push({ type: 'mock' })
    if (usePastebin) sources.push({ type: 'pastebin' })
    if (htmlName.trim() && htmlArchive.trim() && htmlLink.trim()) {
      sources.push({
        type: 'html',
        options: {
          name: htmlName.trim(),
          archiveUrl: htmlArchive.trim(),
          linkSelector: htmlLink.trim(),
          contentSelector: htmlContent.trim() || 'body',
          viaSetu: htmlViaSetu,
        },
      })
    }
    return sources
  }

  function start() {
    setLocalNotice('')
    const kw = [...keywords]
    if (draft.trim()) {
      for (const p of draft.split(',').map((s) => s.trim()).filter(Boolean)) {
        if (!kw.some((k) => k.toLowerCase() === p.toLowerCase())) kw.push(p)
      }
      addKeyword(draft)
      setDraft('')
    }
    if (!kw.length) {
      setLocalNotice('Add at least one keyword.')
      return
    }
    const sources = collectSources()
    if (!sources.length) {
      setLocalNotice('Select at least one source.')
      return
    }
    onStart({
      keywords: kw,
      mode,
      intervalMs: Math.max(2, intervalSec) * 1000,
      sources,
      matchOptions: { wholeWord, caseSensitive },
    })
  }

  return (
    <section className="panel controls">
      <div className="field">
        <span>Keywords</span>
        <div className="chips">
          {keywords.map((kw) => (
            <span className="chip" key={kw}>
              {kw}
              <button
                type="button"
                aria-label={`remove ${kw}`}
                disabled={running}
                onClick={() => setKeywords((prev) => prev.filter((k) => k !== kw))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <input
          type="text"
          placeholder="type a keyword, press Enter"
          value={draft}
          disabled={running}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <small>Every keyword is checked against every paste.</small>
      </div>

      <fieldset className="field">
        <span>Match mode</span>
        <label className="radio">
          <input type="radio" name="mode" checked={mode === 'any'} disabled={running} onChange={() => setMode('any')} />
          Any keyword
        </label>
        <label className="radio">
          <input type="radio" name="mode" checked={mode === 'all'} disabled={running} onChange={() => setMode('all')} />
          All keywords
        </label>
      </fieldset>

      <div className="field inline">
        <label className="check">
          <input type="checkbox" checked={wholeWord} disabled={running} onChange={(e) => setWholeWord(e.target.checked)} />
          Whole word
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={caseSensitive}
            disabled={running}
            onChange={(e) => setCaseSensitive(e.target.checked)}
          />
          Case sensitive
        </label>
      </div>

      <label className="field">
        <span>Poll interval (seconds)</span>
        <input
          type="number"
          min={2}
          value={intervalSec}
          disabled={running}
          onChange={(e) => setIntervalSec(Number(e.target.value) || 2)}
        />
      </label>

      <fieldset className="field">
        <span>Sources</span>
        <label className="check">
          <input type="checkbox" checked={useMock} disabled={running} onChange={(e) => setUseMock(e.target.checked)} />
          Mock (synthetic demo)
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={usePastebin}
            disabled={running}
            onChange={(e) => setUsePastebin(e.target.checked)}
          />
          Pastebin (needs PRO scraping API)
        </label>
      </fieldset>

      <details className="field advanced">
        <summary>Custom HTML source</summary>
        <label className="field">
          <span>Name</span>
          <input type="text" placeholder="mysite" value={htmlName} disabled={running} onChange={(e) => setHtmlName(e.target.value)} />
        </label>
        <label className="field">
          <span>Archive URL</span>
          <input type="text" placeholder="https://example.com/recent" value={htmlArchive} disabled={running} onChange={(e) => setHtmlArchive(e.target.value)} />
        </label>
        <label className="field">
          <span>Link selector</span>
          <input type="text" placeholder="a.paste-link" value={htmlLink} disabled={running} onChange={(e) => setHtmlLink(e.target.value)} />
        </label>
        <label className="field">
          <span>Content selector</span>
          <input type="text" placeholder="pre, body" value={htmlContent} disabled={running} onChange={(e) => setHtmlContent(e.target.value)} />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={htmlViaSetu}
            disabled={running || !setuAvailable}
            onChange={(e) => setHtmlViaSetu(e.target.checked)}
          />
          Route through Setu proxies
        </label>
        <small>
          {setuAvailable
            ? 'Fetches archive and item pages from rotating free proxies instead of this server’s IP.'
            : 'Set SETU_URL (and SETU_TOKEN) on the Shodh server to enable.'}
        </small>
        <small>Only use on sites whose ToS and robots.txt permit it.</small>
      </details>

      <div className="actions">
        <button type="button" className="btn primary" disabled={running} onClick={start}>
          Start
        </button>
        <button type="button" className="btn" disabled={!running} onClick={onStop}>
          Stop
        </button>
      </div>

      <p className="notice">{notice || localNotice}</p>
    </section>
  )
}
