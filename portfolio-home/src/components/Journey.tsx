import { useEffect, useRef, useState } from 'react'
import { journey } from '../data/profile'
import ScrambleText from './ScrambleText'

/**
 * The career as a pinned scene: the section holds while scrolling walks through the
 * years. The timeline fills, the year decodes, and a dot travels from Pune to Bangalore.
 */
export default function Journey({ reduced }: { reduced: boolean }) {
  const ref = useRef<HTMLElement>(null)
  const tlRef = useRef<HTMLOListElement>(null)
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

  // On phones the years are a horizontal strip: keep the current one in view.
  useEffect(() => {
    const tl = tlRef.current
    const btn = tl?.children[stage] as HTMLElement | undefined
    if (tl && btn && tl.scrollWidth > tl.clientWidth) tl.scrollLeft = btn.offsetLeft - 16
  }, [stage])

  const local = progress * n - stage
  const from = journey[stage].route
  const to = journey[Math.min(n - 1, stage + 1)].route
  const route = from === to ? from : from + (to - from) * Math.max(0, (local - 0.5) * 2)

  const jump = (i: number) => {
    const el = ref.current
    if (!el) return
    const top = el.getBoundingClientRect().top + scrollY
    scrollTo({ top: top + (el.offsetHeight - innerHeight) * ((i + 0.5) / n), behavior: reduced ? 'auto' : 'smooth' })
  }

  const s = journey[stage]
  return (
    <section ref={ref} id="journey" className="journey" style={{ height: `${n * 85 + 15}vh` }} aria-labelledby="journey-title">
      <div className="journey-pin">
        <div className="journey-head">
          <h2 id="journey-title">From Pune to Bangalore</h2>
          <p>Four years, two companies, one promotion. Scroll to move through it.</p>
        </div>
        <div className="journey-grid">
          <ol ref={tlRef} className="tl" style={{ '--fill': `${(progress * 100).toFixed(2)}%` } as React.CSSProperties}>
            {journey.map((j, i) => (
              <li key={j.year} className={i === stage ? 'on' : i < stage ? 'past' : undefined}>
                <button type="button" onClick={() => jump(i)} aria-current={i === stage ? 'step' : undefined}>
                  <span className="tl-year">{j.year}</span>
                  <span className="tl-org">{j.org}</span>
                </button>
              </li>
            ))}
          </ol>

          <div className="jcard" aria-live="polite">
            <div className="jcard-top">
              <ScrambleText key={s.year} className="jcard-year" text={s.year} reduced={reduced} duration={600} />
              <span className="jcard-city">{s.city}</span>
            </div>
            <div className="jcard-body" key={stage}>
              <h3>{s.title}</h3>
              <p className="jcard-org">{s.org}</p>
              <ul>
                {s.points.map((pt) => (
                  <li key={pt}>{pt}</li>
                ))}
              </ul>
            </div>
            <div className="route" aria-hidden="true">
              <span>Pune</span>
              <span className="route-line">
                <i style={{ width: `${route * 100}%` }} />
                <em style={{ left: `${route * 100}%` }} />
              </span>
              <span>Bangalore</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
