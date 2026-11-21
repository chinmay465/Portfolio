import { useEffect, useRef, useState } from 'react'

const W = 420
const H = 250
const STEP_MS = 1400
const PHONE = { x: 26, y: 14, w: 132, h: 222 }
const BARS = 9
// The log starts with the first three queue items; the first step adds the fourth.
const START = 2

interface Item {
  title: string
  artist: string
  ad: boolean
}

// What the queue looks like before Swar strips it: songs, with ad slots in between.
const QUEUE: Item[] = [
  { title: 'Morning raga', artist: 'Sitar trio', ad: false },
  { title: 'adPlacements · 15 s', artist: 'pre-roll', ad: true },
  { title: 'Monsoon drive', artist: 'Indie Pune', ad: false },
  { title: 'Late train home', artist: 'Lo-fi Mumbai', ad: false },
  { title: 'playerAds · 30 s', artist: 'mid-roll', ad: true },
  { title: 'Konkan coast', artist: 'Coastal folk', ad: false },
  { title: 'Get Music Premium', artist: 'banner', ad: true },
  { title: 'Night shift', artist: 'Synth Bengaluru', ad: false },
]

const songAfter = (i: number) => {
  let j = i
  while (QUEUE[j % QUEUE.length].ad) j += 1
  return QUEUE[j % QUEUE.length]
}

/**
 * Swar at work: the screen turns off and the music keeps going. Ad slots in the
 * queue are struck out before they can play.
 */
export default function SwarVisual({ active }: { active: boolean }) {
  const [step, setStep] = useState(START)
  const [log, setLog] = useState<Item[]>([QUEUE[2], QUEUE[1], QUEUE[0]])
  const [removed, setRemoved] = useState(12)
  const progress = useRef<SVGRectElement>(null)
  const n = useRef(START)

  useEffect(() => {
    if (!active) return
    const t = setInterval(() => {
      n.current += 1
      const item = QUEUE[n.current % QUEUE.length]
      setStep(n.current)
      setLog((l) => [item, ...l].slice(0, 4))
      if (item.ad) setRemoved((r) => r + 1)
    }, STEP_MS)
    return () => clearInterval(t)
  }, [active])

  // Progress bar of the current song, drawn without re-rendering.
  useEffect(() => {
    if (!active) return
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = ((now - start) / (STEP_MS * 3)) % 1
      progress.current?.setAttribute('width', String(Math.round((PHONE.w - 36) * t)))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active])

  const screenOff = active && Math.floor(step / 3) % 2 === 1
  const song = songAfter(step)
  const cx = PHONE.x + PHONE.w / 2

  return (
    <div className="vis vis-swar" data-active={active} data-screen={screenOff ? 'off' : 'on'}>
      <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <g className="sw-phone">
          <rect x={PHONE.x} y={PHONE.y} width={PHONE.w} height={PHONE.h} rx="20" className="sw-body" />
          <rect x={PHONE.x + 8} y={PHONE.y + 10} width={PHONE.w - 16} height={PHONE.h - 20} rx="13" className="sw-screen" />

          {/* Screen on: the player */}
          <g className="sw-player">
            <rect x={PHONE.x + 30} y={PHONE.y + 30} width={PHONE.w - 60} height={PHONE.w - 60} rx="10" className="sw-art" />
            <text x={cx} y={PHONE.y + 126} className="sw-title">
              {song.title}
            </text>
            <text x={cx} y={PHONE.y + 142} className="sw-artist">
              {song.artist}
            </text>
          </g>

          {/* Screen off: lock screen with the media notification */}
          <g className="sw-lock">
            <text x={cx} y={PHONE.y + 62} className="sw-clock">
              23:47
            </text>
            <rect x={PHONE.x + 14} y={PHONE.y + 98} width={PHONE.w - 28} height="46" rx="9" className="sw-notif" />
            <text x={PHONE.x + 24} y={PHONE.y + 116} className="sw-notif-title">
              {song.title}
            </text>
            <text x={PHONE.x + 24} y={PHONE.y + 132} className="sw-notif-artist">
              ⏮ ⏸ ⏭ · {song.artist}
            </text>
          </g>

          <rect x={PHONE.x + 18} y={PHONE.y + 158} width={PHONE.w - 36} height="3" rx="1.5" className="sw-track" />
          <rect ref={progress} x={PHONE.x + 18} y={PHONE.y + 158} width="0" height="3" rx="1.5" className="sw-progress" />

          {/* The music never stops */}
          <g className="sw-eq" transform={`translate(${PHONE.x + 30} ${PHONE.y + 196})`}>
            {Array.from({ length: BARS }, (_, i) => (
              <rect key={i} x={i * 8.5} y="-22" width="5" height="22" rx="2" style={{ animationDelay: `${(i * 137) % 600}ms` }} />
            ))}
          </g>
        </g>

        <text x="186" y="34" className="sw-label">
          Up next, before Swar
        </text>
        {log.map((item, i) => (
          <g
            key={`${item.title}${step - i}`}
            className={`sw-item${item.ad ? ' ad' : ''}${i === 0 && active ? ' new' : ''}`}
            transform={`translate(186 ${50 + i * 46})`}
          >
            <rect width="216" height="36" rx="10" />
            <text x="14" y="16" className="sw-item-title">
              {item.title}
            </text>
            <text x="14" y="29" className="sw-item-artist">
              {item.ad ? `removed · ${item.artist}` : item.artist}
            </text>
            {item.ad && <line className="sw-strike" x1="10" y1="12" x2="206" y2="12" />}
          </g>
        ))}
      </svg>
      <div className="sw-meta">
        <span>
          Screen <strong>{screenOff ? 'off' : 'on'}</strong> · still playing
        </span>
        <span>
          <strong>{removed}</strong> ads removed before they played
        </span>
      </div>
      <p className="vis-note">Simulated queue</p>
    </div>
  )
}
