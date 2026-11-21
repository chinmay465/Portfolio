import { useEffect, useRef, useState } from 'react'
import { journey } from '../data/profile'

interface Props {
  onStage: (i: number) => void
}

/**
 * The career as a pinned scene: the section holds still while scrolling walks through
 * the years, and a dot travels the route from Pune to Bangalore.
 */
export default function Journey({ onStage }: Props) {
  const ref = useRef<HTMLElement>(null)
  const [progress, setProgress] = useState(0)
  const n = journey.length
  const stage = Math.min(n - 1, Math.floor(progress * n))

  useEffect(() => {
    const update = () => {
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const span = r.height - innerHeight
      setProgress(span > 0 ? Math.min(0.9999, Math.max(0, -r.top / span)) : 0)
    }
    addEventListener('scroll', update, { passive: true })
    addEventListener('resize', update)
    update()
    return () => {
      removeEventListener('scroll', update)
      removeEventListener('resize', update)
    }
  }, [])

  useEffect(() => onStage(stage), [stage, onStage])

  // Where the dot sits between Pune (0) and Bangalore (1), easing across the move.
  const local = progress * n - stage
  const from = journey[stage].route
  const to = journey[Math.min(n - 1, stage + 1)].route
  const route = from === to ? from : from + (to - from) * Math.max(0, (local - 0.5) * 2)

  const jump = (i: number) => {
    const el = ref.current
    if (!el) return
    const top = el.getBoundingClientRect().top + scrollY
    const span = el.offsetHeight - innerHeight
    scrollTo({ top: top + span * ((i + 0.5) / n), behavior: 'smooth' })
  }

  const s = journey[stage]
  return (
    <section
      ref={ref}
      id="journey"
      className="journey"
      data-scene="journey"
      style={{ height: `${n * 100}vh` }}
      aria-labelledby="journey-title"
    >
      <div className="journey-pin">
        <div className="journey-card">
          <p className="chapter-mark">
            <span lang="mr">प्रवास</span> The journey so far
          </p>
          <h2 id="journey-title" className="sr-only">
            Career journey
          </h2>
          <div className="journey-stage" key={stage} aria-live="polite">
            <p className="journey-year">
              {s.year}
              <span>{s.city}</span>
            </p>
            <h3>{s.title}</h3>
            <p className="journey-org">{s.org}</p>
            <ul>
              {s.points.map((pt) => (
                <li key={pt}>{pt}</li>
              ))}
            </ul>
          </div>
          <ol className="journey-steps" aria-label="Years">
            {journey.map((j, i) => (
              <li key={j.year}>
                <button
                  type="button"
                  className={i === stage ? 'on' : i < stage ? 'past' : undefined}
                  onClick={() => jump(i)}
                  aria-current={i === stage ? 'step' : undefined}
                >
                  {j.year}
                </button>
              </li>
            ))}
          </ol>
          <div className="route" aria-hidden="true">
            <span className="route-city">
              <b lang="mr">पुणे</b> Pune
            </span>
            <span className="route-line">
              <i style={{ width: `${route * 100}%` }} />
              <em style={{ left: `${route * 100}%` }} />
            </span>
            <span className="route-city">
              <b lang="mr">बंगळुरू</b> Bangalore
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
