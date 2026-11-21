import { useCallback, useEffect, useRef, useState } from 'react'
import { journey } from '../data/profile'
import { useInView } from '../hooks/motion'
import ScrambleText from './ScrambleText'

const AUTOPLAY_MS = 6500

/**
 * The career as a compact slider that takes one screen: swipe on a phone, click a year
 * or use the arrows on desktop. It plays through on its own while on screen and stops
 * for good the moment someone touches it.
 */
export default function Journey({ reduced }: { reduced: boolean }) {
  const sectionRef = useRef<HTMLElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const tlRef = useRef<HTMLOListElement>(null)
  const [active, setActive] = useState(0)
  const [interacted, setInteracted] = useState(false)
  // While a click or autoplay glides across several cards, ignore the in-between scroll positions.
  const jumping = useRef(false)
  const visible = useInView(sectionRef, '-20% 0px')
  const n = journey.length
  const autoplay = visible && !interacted && !reduced

  const goTo = useCallback(
    (i: number) => {
      const track = trackRef.current
      if (!track) return
      const next = (i + n) % n
      jumping.current = true
      const release = () => {
        jumping.current = false
        track.removeEventListener('scrollend', release)
      }
      track.addEventListener('scrollend', release)
      setTimeout(release, 900)
      track.scrollTo({ left: next * track.clientWidth, behavior: reduced ? 'auto' : 'smooth' })
      setActive(next)
    },
    [n, reduced],
  )

  const stop = () => setInteracted(true)

  // Keep the active index in step with swipes and trackpad scrolls.
  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        if (!jumping.current) setActive(Math.round(track.scrollLeft / track.clientWidth))
      })
    }
    track.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      track.removeEventListener('scroll', onScroll)
    }
  }, [])

  useEffect(() => {
    if (!autoplay) return
    const t = setTimeout(() => goTo(active + 1), AUTOPLAY_MS)
    return () => clearTimeout(t)
  }, [autoplay, active, goTo])

  // On phones the years are a horizontal strip: keep the current one in view.
  useEffect(() => {
    const tl = tlRef.current
    const btn = tl?.children[active] as HTMLElement | undefined
    if (tl && btn && tl.scrollWidth > tl.clientWidth) {
      tl.scrollTo({ left: btn.offsetLeft - 16, behavior: reduced ? 'auto' : 'smooth' })
    }
  }, [active, reduced])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      stop()
      goTo(active + 1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      stop()
      goTo(active - 1)
    }
  }

  const route = journey[active].route
  return (
    <section
      ref={sectionRef}
      id="journey"
      className="journey"
      aria-labelledby="journey-title"
      onPointerDown={stop}
      onWheel={(e) => Math.abs(e.deltaX) > Math.abs(e.deltaY) && stop()}
    >
      <div className="journey-head">
        <h2 id="journey-title">From Pune to Bangalore</h2>
        <p>
          <span className="only-wide">Pick a year, or use the arrows.</span>
          <span className="only-narrow">Swipe the card or tap a year.</span>
        </p>
      </div>

      <div className="journey-grid">
        <ol ref={tlRef} className="tl" style={{ '--fill': `${(active / (n - 1)) * 100}%` } as React.CSSProperties}>
          {journey.map((j, i) => (
            <li key={j.year} className={i === active ? 'on' : i < active ? 'past' : undefined}>
              <button type="button" onClick={() => goTo(i)} aria-current={i === active ? 'step' : undefined}>
                <span className="tl-year">{j.year}</span>
                <span className="tl-org">{j.org}</span>
              </button>
            </li>
          ))}
        </ol>

        <div className="jwrap">
          <div
            ref={trackRef}
            className="jtrack"
            tabIndex={0}
            role="region"
            aria-roledescription="carousel"
            aria-label="Career, one year per card"
            onKeyDown={onKey}
            onTouchStart={stop}
          >
            {journey.map((s, i) => (
              <article
                key={s.year}
                className={`jcard${i === active ? ' on' : ''}`}
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${n}: ${s.year}`}
                aria-hidden={i !== active}
              >
                <div className="jcard-top">
                  {i === active ? (
                    <ScrambleText key={active} className="jcard-year" text={s.year} reduced={reduced} duration={600} />
                  ) : (
                    <span className="jcard-year">{s.year}</span>
                  )}
                  <span className="jcard-city">{s.city}</span>
                </div>
                <div className="jcard-body">
                  <h3>{s.title}</h3>
                  <p className="jcard-org">{s.org}</p>
                  <ul>
                    {s.points.map((pt) => (
                      <li key={pt}>{pt}</li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>

          <div className="jcontrols">
            <button
              type="button"
              className="jarrow"
              onClick={() => {
                stop()
                goTo(active - 1)
              }}
              aria-label="Previous year"
            >
              <span aria-hidden="true">‹</span>
            </button>
            <div className="jprogress" aria-hidden="true">
              {journey.map((j, i) => (
                <span key={j.year} className={i === active ? 'on' : i < active ? 'past' : undefined}>
                  {i === active && autoplay && (
                    <i key={active} style={{ animationDuration: `${AUTOPLAY_MS}ms` }} />
                  )}
                </span>
              ))}
            </div>
            <span className="jcount" aria-live="polite">
              {active + 1} / {n}
            </span>
            <button
              type="button"
              className="jarrow"
              onClick={() => {
                stop()
                goTo(active + 1)
              }}
              aria-label="Next year"
            >
              <span aria-hidden="true">›</span>
            </button>
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
    </section>
  )
}
