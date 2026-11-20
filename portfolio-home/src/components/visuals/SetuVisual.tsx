import { useEffect, useRef, useState } from 'react'

const W = 420
const H = 250
const YOU = { x: 44, y: 150 }
const SITE = { x: 376, y: 150 }
const SLOTS = [
  { x: 128, y: 108 },
  { x: 170, y: 76 },
  { x: 210, y: 64 },
  { x: 250, y: 76 },
  { x: 292, y: 108 },
  { x: 150, y: 178 },
  { x: 210, y: 196 },
  { x: 270, y: 178 },
]
const HOP_MS = 1300

type Health = 'ok' | 'strike' | 'dead' | 'new'
interface Hop {
  proxy: number
  fail: boolean
  n: number
}

function along(a: { x: number; y: number }, b: { x: number; y: number }, t: number) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

/**
 * Setu's pool at work: each request crosses the bridge through a random fast proxy.
 * A blocked hop retries elsewhere; a proxy that keeps failing is evicted and replaced.
 */
export default function SetuVisual({ active }: { active: boolean }) {
  const [pool, setPool] = useState<Health[]>(() => SLOTS.map(() => 'ok'))
  const [hop, setHop] = useState<Hop>({ proxy: 2, fail: false, n: 1 })
  const [log, setLog] = useState('Request 1 through proxy 3, 200 OK')
  const dot = useRef<SVGCircleElement>(null)
  const strikes = useRef<number[]>(SLOTS.map(() => 0))

  // Pick the next hop. State lives in refs so the interval never reads stale values.
  const poolRef = useRef(pool)
  const countRef = useRef(1)
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => {
      const next = poolRef.current.map((h): Health => (h === 'new' ? 'ok' : h === 'dead' ? 'new' : h))
      const alive = next.map((h, i) => (h === 'ok' || h === 'strike' ? i : -1)).filter((i) => i >= 0)
      const proxy = alive[Math.floor(Math.random() * alive.length)]
      const fail = Math.random() < 0.22
      if (fail) {
        strikes.current[proxy] += 1
        if (strikes.current[proxy] >= 2) {
          strikes.current[proxy] = 0
          next[proxy] = 'dead'
          setLog(`Proxy ${proxy + 1} failed twice, evicted and replaced`)
        } else {
          next[proxy] = 'strike'
          setLog(`429 from proxy ${proxy + 1}, retrying on another`)
        }
      } else {
        strikes.current[proxy] = 0
        next[proxy] = 'ok'
        countRef.current += 1
        setLog(`Request ${countRef.current} through proxy ${proxy + 1}, 200 OK`)
      }
      poolRef.current = next
      setPool(next)
      setHop({ proxy, fail, n: countRef.current })
    }, HOP_MS)
    return () => clearInterval(t)
  }, [active])

  // Move the packet along you → proxy → site (or bounce back on a failure).
  useEffect(() => {
    if (!active) return
    const p = SLOTS[hop.proxy]
    let raf = 0
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / (HOP_MS * 0.8))
      let pos
      if (hop.fail) pos = t < 0.5 ? along(YOU, p, t * 2) : along(p, YOU, (t - 0.5) * 2)
      else pos = t < 0.5 ? along(YOU, p, t * 2) : along(p, SITE, (t - 0.5) * 2)
      dot.current?.setAttribute('cx', String(pos.x))
      dot.current?.setAttribute('cy', String(pos.y))
      dot.current?.setAttribute('opacity', t > 0.02 && t < 0.98 ? '1' : '0')
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [hop, active])

  const live = pool.filter((h) => h === 'ok' || h === 'strike').length
  const p = SLOTS[hop.proxy]
  return (
    <div className="vis vis-setu" data-active={active}>
      <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <defs>
          <linearGradient id="arch" x1="0" x2="1">
            <stop offset="0" stopColor="#b9a4ff" stopOpacity=".1" />
            <stop offset=".5" stopColor="#b9a4ff" stopOpacity=".7" />
            <stop offset="1" stopColor="#b9a4ff" stopOpacity=".1" />
          </linearGradient>
        </defs>
        <path className="setu-arch" d={`M${YOU.x} ${YOU.y} Q 210 -30 ${SITE.x} ${SITE.y}`} stroke="url(#arch)" />
        <path className="setu-arch setu-arch-low" d={`M${YOU.x} ${YOU.y} Q 210 250 ${SITE.x} ${SITE.y}`} />
        {SLOTS.map((s, i) => (
          <line key={`a${i}`} className="setu-wire" x1={YOU.x} y1={YOU.y} x2={s.x} y2={s.y} />
        ))}
        {SLOTS.map((s, i) => (
          <line key={`b${i}`} className="setu-wire" x1={s.x} y1={s.y} x2={SITE.x} y2={SITE.y} />
        ))}
        <polyline
          key={`route${hop.n}${hop.proxy}${hop.fail}`}
          className={`setu-route${hop.fail ? ' fail' : ''}`}
          points={hop.fail ? `${YOU.x},${YOU.y} ${p.x},${p.y}` : `${YOU.x},${YOU.y} ${p.x},${p.y} ${SITE.x},${SITE.y}`}
        />
        {SLOTS.map((s, i) => (
          <g key={i} className={`setu-node ${pool[i]}${i === hop.proxy ? ' current' : ''}`} transform={`translate(${s.x} ${s.y})`}>
            <circle r="13" />
            <text dy="4">{i + 1}</text>
          </g>
        ))}
        <g className="setu-end" transform={`translate(${YOU.x} ${YOU.y})`}>
          <circle r="22" />
          <text dy="4">You</text>
        </g>
        <g className={`setu-end site${hop.fail ? '' : ' ok'}`} key={`site${hop.n}`} transform={`translate(${SITE.x} ${SITE.y})`}>
          <circle r="22" />
          <text dy="4">Site</text>
        </g>
        <circle ref={dot} className="setu-packet" r="5" cx={YOU.x} cy={YOU.y} opacity="0" />
      </svg>
      <div className="setu-meta">
        <span>
          <strong>{live}</strong> of {SLOTS.length} proxies alive
        </span>
        <span className="setu-log">{log}</span>
      </div>
      <p className="vis-note">Simulated pool</p>
    </div>
  )
}
