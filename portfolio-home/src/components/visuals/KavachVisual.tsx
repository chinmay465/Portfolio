import { useEffect, useRef, useState } from 'react'

const W = 420
const H = 250
const APPS = ['JioHotstar', 'Prime Video', 'YT Music', 'A game']
const APP_Y = [46, 98, 150, 202]
const APP_RIGHT = 112
const SHIELD = { x: 236, y: 124 }
const NET = { x: 374, y: 124 }
const STEP_MS = 1150

interface Lookup {
  domain: string
  app: number
  blocked: boolean
}

// Real lookups seen while testing Kavach, trimmed to a few per app.
const LOOKUPS: Lookup[] = [
  { domain: 'img.hotstar.com', app: 0, blocked: false },
  { domain: 'hesads.akamaized.net', app: 0, blocked: true },
  { domain: 'imasdk.googleapis.com', app: 0, blocked: true },
  { domain: 'hses8.hotstar.com', app: 0, blocked: false },
  { domain: 'atv-ext.amazon.com', app: 1, blocked: false },
  { domain: 'aax-eu.amazon-adsystem.com', app: 1, blocked: true },
  { domain: 'm.media-amazon.com', app: 1, blocked: false },
  { domain: 'music.youtube.com', app: 2, blocked: false },
  { domain: 'pagead2.googlesyndication.com', app: 2, blocked: true },
  { domain: 'rr2---sn-ccoa-cagz.googlevideo.com', app: 2, blocked: true },
  { domain: 'i.ytimg.com', app: 2, blocked: false },
  { domain: 'app-measurement.com', app: 3, blocked: true },
  { domain: 'd.applovin.com', app: 3, blocked: true },
  { domain: 'play.googleapis.com', app: 3, blocked: false },
]

type Point = { x: number; y: number }
const along = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

/**
 * Kavach at work: every app's DNS lookup goes through the shield. Ad and tracker
 * domains stop there (NXDOMAIN); everything else goes on to the internet.
 */
export default function KavachVisual({ active }: { active: boolean }) {
  const [current, setCurrent] = useState<{ lookup: Lookup; n: number }>({ lookup: LOOKUPS[1], n: 0 })
  const [log, setLog] = useState<Lookup[]>([LOOKUPS[1], LOOKUPS[0], LOOKUPS[5]])
  const [counts, setCounts] = useState({ blocked: 41, total: 77 })
  const dot = useRef<SVGCircleElement>(null)
  const last = useRef(1)
  const n = useRef(0)

  useEffect(() => {
    if (!active) return
    const t = setInterval(() => {
      let i = Math.floor(Math.random() * LOOKUPS.length)
      if (i === last.current) i = (i + 1) % LOOKUPS.length
      last.current = i
      n.current += 1
      const lookup = LOOKUPS[i]
      setCurrent({ lookup, n: n.current })
      setLog((l) => [lookup, ...l].slice(0, 4))
      setCounts((c) => ({ blocked: c.blocked + (lookup.blocked ? 1 : 0), total: c.total + 1 }))
    }, STEP_MS)
    return () => clearInterval(t)
  }, [active])

  // Fly the lookup from its app to the shield, then on to the internet if allowed.
  useEffect(() => {
    if (!active) return
    const from = { x: APP_RIGHT, y: APP_Y[current.lookup.app] }
    let raf = 0
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / (STEP_MS * 0.85))
      const pos = t < 0.5 ? along(from, SHIELD, t * 2) : along(SHIELD, NET, (t - 0.5) * 2)
      const visible = t > 0.02 && (current.lookup.blocked ? t < 0.5 : t < 0.98)
      dot.current?.setAttribute('cx', String(pos.x))
      dot.current?.setAttribute('cy', String(pos.y))
      dot.current?.setAttribute('opacity', visible ? '1' : '0')
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [current, active])

  const { lookup } = current
  const appY = APP_Y[lookup.app]
  return (
    <div className="vis vis-kavach" data-active={active}>
      <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        {APP_Y.map((y, i) => (
          <line key={`w${i}`} className="kv-wire" x1={APP_RIGHT} y1={y} x2={SHIELD.x} y2={SHIELD.y} />
        ))}
        <line className="kv-wire kv-wire-out" x1={SHIELD.x} y1={SHIELD.y} x2={NET.x} y2={NET.y} />
        {active && (
          <polyline
            key={`route${current.n}`}
            className={`kv-route${lookup.blocked ? ' blocked' : ''}`}
            points={
              lookup.blocked
                ? `${APP_RIGHT},${appY} ${SHIELD.x},${SHIELD.y}`
                : `${APP_RIGHT},${appY} ${SHIELD.x},${SHIELD.y} ${NET.x},${NET.y}`
            }
          />
        )}
        {APPS.map((name, i) => (
          <g key={name} className={`kv-app${active && i === lookup.app ? ' current' : ''}`} transform={`translate(14 ${APP_Y[i] - 15})`}>
            <rect width={APP_RIGHT - 14} height="30" rx="10" />
            <text x={(APP_RIGHT - 14) / 2} y="19">
              {name}
            </text>
          </g>
        ))}
        <g
          key={`shield${current.n}`}
          className={`kv-shield${active && lookup.blocked ? ' hit' : ''}`}
          transform={`translate(${SHIELD.x - 31} ${SHIELD.y - 34}) scale(2.6)`}
        >
          <path d="M12,2L4,5v6c0,5.2 3.4,10 8,11c4.6,-1 8,-5.8 8,-11V5L12,2z" />
          <path className="kv-check" d="M10.6,15.6L7,12l1.4,-1.4 2.2,2.2 5,-5L17,9.2 10.6,15.6z" />
        </g>
        <g className={`kv-net${active && !lookup.blocked ? ' ok' : ''}`} key={`net${current.n}`} transform={`translate(${NET.x} ${NET.y})`}>
          <circle r="26" />
          <text dy="4">Internet</text>
        </g>
        <circle ref={dot} className="kv-packet" r="5" cx={APP_RIGHT} cy={appY} opacity="0" />
      </svg>
      <div className="kv-meta">
        <span>
          <strong>{counts.blocked}</strong> blocked of {counts.total} lookups
        </span>
        <ul className="kv-log">
          {log.map((l, i) => (
            <li key={`${l.domain}${i}${current.n}`} className={l.blocked ? 'blocked' : ''}>
              <span aria-hidden="true">{l.blocked ? '✕' : '·'}</span> {l.domain}
            </li>
          ))}
        </ul>
      </div>
      <p className="vis-note">Simulated lookups</p>
    </div>
  )
}
