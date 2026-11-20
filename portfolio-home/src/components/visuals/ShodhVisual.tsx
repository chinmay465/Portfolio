import { useEffect, useRef, useState } from 'react'

const KEYWORDS = ['acme', 'acme.io']
const SOURCES = ['pastebin', 'archive', 'mock']
const PASTES = [
  'staging config for api.acme.io, rotate before friday',
  'grocery list: rice, dal, jaggery, tea',
  'npm ERR! peer dep conflict in react-dom@19',
  'meeting notes: acme onboarding call moved to 4pm',
  'SELECT * FROM orders WHERE status = pending',
  'lorem ipsum dolor sit amet, consectetur',
  'webhook payload sample from acme billing',
  'fn main() { println!("hello"); }',
  'bookmark dump: docs, blog, acme.io/careers',
  'git rebase -i HEAD~3 cheat sheet',
]

interface Line {
  id: number
  source: string
  text: string
  hits: string[]
}

function highlight(text: string) {
  const parts = text.split(/(acme\.io|acme)/g)
  return parts.map((part, i) => (KEYWORDS.includes(part) ? <mark key={i}>{part}</mark> : <span key={i}>{part}</span>))
}

/** Shodh's live feed: pastes stream in, matches light up with the keywords that hit. */
const toLine = (i: number): Line => {
  const text = PASTES[i % PASTES.length]
  return { id: i, source: SOURCES[i % SOURCES.length], text, hits: KEYWORDS.filter((k) => text.includes(k)) }
}
const PRIMED = 4

export default function ShodhVisual({ active }: { active: boolean }) {
  // Open mid-session so the first frame already shows a few pastes and a match.
  const [lines, setLines] = useState<Line[]>(() => Array.from({ length: PRIMED }, (_, i) => toLine(i)))
  const [scanned, setScanned] = useState(21)
  const [matches, setMatches] = useState(2)
  const [secs, setSecs] = useState(14)
  const n = useRef(PRIMED)

  useEffect(() => {
    if (!active) return
    const feed = setInterval(() => {
      const line = toLine(n.current++)
      setScanned((s) => s + 3 + (line.id % 4))
      if (line.hits.length) setMatches((m) => m + 1)
      setLines((l) => [...l, line].slice(-6))
    }, 900)
    const clock = setInterval(() => setSecs((s) => s + 1), 1000)
    return () => {
      clearInterval(feed)
      clearInterval(clock)
    }
  }, [active])

  const mm = String(Math.floor(secs / 60)).padStart(2, '0')
  const ss = String(secs % 60).padStart(2, '0')
  return (
    <div className="vis vis-shodh" data-active={active}>
      <div className="sh-head">
        <span className="sh-live">
          <i /> Watching {mm}:{ss}
        </span>
        <span className="sh-kw">
          {KEYWORDS.map((k) => (
            <b key={k}>{k}</b>
          ))}
          <em>any</em>
        </span>
      </div>
      <div className="sh-stats">
        <span>
          <strong>{scanned}</strong> pastes scanned
        </span>
        <span>
          <strong>{matches}</strong> matches
        </span>
      </div>
      <ol className="sh-feed" aria-hidden="true">
        {lines.map((l) => (
          <li key={l.id} className={l.hits.length ? 'hit' : undefined}>
            <span className="sh-src">{l.source}</span>
            <span className="sh-text">{l.hits.length ? highlight(l.text) : l.text}</span>
          </li>
        ))}
      </ol>
      <p className="vis-note">Simulated feed</p>
    </div>
  )
}
