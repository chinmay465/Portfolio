import { useEffect, useState } from 'react'

const ROUTES = [
  { label: 'Direct', train: '17307 Basava Express', time: '13h 10m', extra: '', status: 'WL 23', tone: 'bad' },
  { label: 'Via Solapur', train: '1 change, 2 trains', time: '14h 50m', extra: '+1h 40m', status: 'AVL 42', tone: 'good' },
  { label: 'From Yesvantpur', train: 'Nearby station, direct', time: '13h 35m', extra: '+25m', status: 'RAC 8', tone: 'mid' },
] as const

const START = 2 * 86400 + 14 * 3600 + 9 * 60 + 31

function countdown(s: number) {
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d)}d ${p(h)}h ${p(m)}m ${p(sec)}s`
}

/** Rail Planner's results: a booking-window countdown, alternate routes with seat status, a train on its way. */
export default function RailVisual({ active }: { active: boolean }) {
  const [left, setLeft] = useState(START)
  const [pick, setPick] = useState(1)

  useEffect(() => {
    if (!active) return
    const tick = setInterval(() => setLeft((l) => (l > 0 ? l - 1 : START)), 1000)
    const cycle = setInterval(() => setPick((p) => (p + 1) % ROUTES.length), 1800)
    return () => {
      clearInterval(tick)
      clearInterval(cycle)
    }
  }, [active])

  return (
    <div className="vis vis-rail" data-active={active}>
      <div className="rp-head">
        <span className="rp-trip">
          <b>SBC</b>
          <i aria-hidden="true" />
          <b>SUR</b>
        </span>
        <span className="rp-date">Tue, 20 Jan</span>
      </div>

      <div className="rp-window">
        <span className="rp-window-label">General booking opens in</span>
        <strong className="rp-count">{countdown(left)}</strong>
        <span className="rp-window-sub">Tatkal: 19 Jan, 10:00 (AC)</span>
      </div>

      <ol className="rp-routes" aria-hidden="true">
        {ROUTES.map((r, i) => (
          <li key={r.label} className={i === pick ? 'on' : undefined}>
            <span className="rp-route">
              <b>{r.label}</b>
              <em>{r.train}</em>
            </span>
            <span className="rp-time">
              {r.time}
              {r.extra && <small>{r.extra}</small>}
            </span>
            <span className={`rp-seat ${r.tone}`}>{r.status}</span>
          </li>
        ))}
      </ol>

      <div className="rp-track" aria-hidden="true">
        <span>SBC</span>
        <span className="rp-line">
          <i className="rp-stop" />
          <i className="rp-train" />
        </span>
        <span>SUR</span>
      </div>
      <p className="vis-note">Simulated results</p>
    </div>
  )
}
