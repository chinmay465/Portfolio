import { useEffect, useRef, useState } from 'react'

const W = 420
const H = 250
const C = { x: 130, y: 124 }
const R = 88
const STEP_MS = 1400

type Kind = 'Camera' | 'Mic' | 'GPS' | 'Clipboard'

interface Use {
  app: string
  kind: Kind
  /** Not on screen when it happened. */
  bg: boolean
  note: string
}

const ANGLE: Record<Kind, number> = { Camera: -90, Mic: 55, GPS: 125, Clipboard: 200 }

// Made-up apps and the kind of thing Prahari flags.
const USES: Use[] = [
  { app: 'SnapEdit', kind: 'Camera', bg: false, note: 'back camera · 12s' },
  { app: 'QuickCart', kind: 'Clipboard', bg: true, note: 'read in background' },
  { app: 'ChatNow', kind: 'Mic', bg: false, note: 'voice chat · 2 min' },
  { app: 'Weather Pro', kind: 'GPS', bg: true, note: 'screen off' },
  { app: 'FlashLite', kind: 'Mic', bg: true, note: 'screen off · 40s' },
  { app: 'Maps', kind: 'GPS', bg: false, note: 'navigation' },
  { app: 'QuickCart', kind: 'Camera', bg: true, note: 'not on screen' },
  { app: 'Keyboard+', kind: 'Clipboard', bg: false, note: 'your keyboard' },
]

const KIND_CLASS: Record<Kind, string> = { Camera: 'cam', Mic: 'mic', GPS: 'gps', Clipboard: 'clip' }

const polar = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180
  return { x: C.x + r * Math.cos(a), y: C.y + r * Math.sin(a) }
}

/**
 * Prahari at work: a radar sweeps the phone's sensors; each use lands as a
 * blip and a timeline row, and background uses are flagged in red.
 */
export default function PrahariVisual({ active }: { active: boolean }) {
  const [n, setN] = useState(0)
  const [log, setLog] = useState<Use[]>([USES[3], USES[0], USES[1]])
  const [flagged, setFlagged] = useState(2)
  const tick = useRef(0)

  useEffect(() => {
    if (!active) return
    const t = setInterval(() => {
      tick.current += 1
      const use = USES[tick.current % USES.length]
      setN(tick.current)
      setLog((l) => [use, ...l].slice(0, 4))
      if (use.bg) setFlagged((f) => f + 1)
    }, STEP_MS)
    return () => clearInterval(t)
  }, [active])

  const current = log[0]
  const blip = polar(ANGLE[current.kind], R * 0.62)
  return (
    <div className="vis vis-prahari" data-active={active}>
      <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <circle key={i} className="ph-ring" cx={C.x} cy={C.y} r={(R * i) / 4} />
        ))}
        <line className="ph-axis" x1={C.x - R} y1={C.y} x2={C.x + R} y2={C.y} />
        <line className="ph-axis" x1={C.x} y1={C.y - R} x2={C.x} y2={C.y + R} />
        <g className="ph-sweep" style={{ transformOrigin: `${C.x}px ${C.y}px` }}>
          <path d={`M${C.x},${C.y} L${C.x + R},${C.y} A${R},${R} 0 0,0 ${polar(-50, R).x},${polar(-50, R).y} Z`} />
        </g>
        {(Object.keys(ANGLE) as Kind[]).map((k) => {
          const p = polar(ANGLE[k], R + 14)
          return (
            <text key={k} className={`ph-label ${KIND_CLASS[k]}`} x={p.x} y={p.y + 4}>
              {k}
            </text>
          )
        })}
        <g key={`blip${n}`} className={`ph-blip ${KIND_CLASS[current.kind]}${current.bg ? ' bg' : ''}`}>
          <circle className="ph-blip-halo" cx={blip.x} cy={blip.y} r="14" />
          <circle cx={blip.x} cy={blip.y} r="5" />
        </g>
        <circle className="ph-core" cx={C.x} cy={C.y} r="4" />
      </svg>
      <div className="ph-meta">
        <span>
          <strong>{flagged}</strong> background uses flagged
        </span>
        <ul className="ph-log">
          {log.map((u, i) => (
            <li key={`${n}-${i}`} className={u.bg ? 'bg' : ''}>
              <b className={KIND_CLASS[u.kind]}>{u.kind}</b> {u.app}
              <em>{u.note}</em>
            </li>
          ))}
        </ul>
      </div>
      <p className="vis-note">Simulated timeline</p>
    </div>
  )
}
