import { useState } from 'react'
import { dayLabel } from './api.ts'

interface Props {
  daily: { date: string; visitors: number }[]
}

const W = 720
const H = 200
const PAD = { top: 16, right: 8, bottom: 26, left: 8 }

/** New visitors per IST day, as bars. Hover or tap a bar for its exact count. */
export function DailyChart({ daily }: Props) {
  const [active, setActive] = useState<number | null>(null)
  const max = Math.max(1, ...daily.map((d) => d.visitors))
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const slot = innerW / daily.length
  const bar = Math.max(2, slot * 0.68)
  const ticks = daily.length <= 7 ? daily.map((_, i) => i) : [0, Math.floor((daily.length - 1) / 2), daily.length - 1]
  const shown = active ?? daily.length - 1
  const focus = daily[shown]

  return (
    <figure className="chart">
      <figcaption>
        <span className="muted">New visitors per day</span>
        {focus && (
          <span>
            <strong>{focus.visitors}</strong> on {dayLabel(focus.date)}
          </span>
        )}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="New visitors per day" onMouseLeave={() => setActive(null)}>
        <line className="baseline" x1={PAD.left} x2={W - PAD.right} y1={PAD.top + innerH} y2={PAD.top + innerH} />
        {daily.map((d, i) => {
          const h = d.visitors ? Math.max(3, (d.visitors / max) * innerH) : 0
          const x = PAD.left + i * slot + (slot - bar) / 2
          return (
            <g key={d.date} onMouseEnter={() => setActive(i)} onClick={() => setActive(i)}>
              <rect className="hit" x={PAD.left + i * slot} y={PAD.top} width={slot} height={innerH} />
              <rect
                className={i === shown ? 'bar on' : 'bar'}
                x={x}
                y={PAD.top + innerH - h}
                width={bar}
                height={h}
                rx={Math.min(4, bar / 2)}
              >
                <title>{`${dayLabel(d.date)}: ${d.visitors}`}</title>
              </rect>
            </g>
          )
        })}
        {ticks.map((i) => (
          <text
            key={i}
            className="tick"
            x={PAD.left + i * slot + slot / 2}
            y={H - 6}
            textAnchor={i === 0 && daily.length > 7 ? 'start' : i === daily.length - 1 && daily.length > 7 ? 'end' : 'middle'}
          >
            {dayLabel(daily[i].date)}
          </text>
        ))}
      </svg>
    </figure>
  )
}
