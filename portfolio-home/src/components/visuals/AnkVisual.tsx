import { useEffect, useState } from 'react'
import { marathiDate, toDevanagariDigits } from '../../lib/format'

const PAPERS = ['सकाळ', 'लोकमत', 'महाराष्ट्र टाइम्स', 'लोकसत्ता', 'पुढारी', 'पुण्यनगरी', 'तरुण भारत']

/** Ank's masthead and reading list: a sheet flips to each paper and it gets ticked off. */
export default function AnkVisual({ active }: { active: boolean }) {
  const [today] = useState(() => marathiDate(new Date()))
  const [read, setRead] = useState(2)
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setRead((r) => (r >= PAPERS.length ? 1 : r + 1)), 1700)
    return () => clearInterval(t)
  }, [active])

  const current = PAPERS[(read - 1) % PAPERS.length]
  return (
    <div className="vis vis-ank" data-active={active}>
      <div className="ank-head">
        <span className="ank-mast">अंक</span>
        <span className="ank-date">{today}</span>
      </div>
      <div className="ank-progress" aria-hidden="true">
        <span style={{ width: `${(read / PAPERS.length) * 100}%` }} />
        <em>
          वाचले {toDevanagariDigits(read)}/{toDevanagariDigits(PAPERS.length)}
        </em>
      </div>
      <div className="ank-body" aria-hidden="true">
        <div className="ank-sheet" key={current}>
          <strong>{current}</strong>
          <span className="ank-city">पुणे आवृत्ती</span>
          <span className="ank-cols">
            {Array.from({ length: 18 }, (_, i) => (
              <i key={i} style={{ width: `${55 + ((i * 37) % 45)}%` }} />
            ))}
          </span>
        </div>
        <ul className="ank-list">
          {PAPERS.map((p, i) => (
            <li key={p} className={i < read ? 'done' : undefined}>
              <span className="ank-check" />
              {p}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
