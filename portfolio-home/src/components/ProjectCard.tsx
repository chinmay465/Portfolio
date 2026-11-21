import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import type { Project } from '../data/projects'
import { healthLabel } from '../hooks/usePings'
import { useSite } from '../context/site'
import { VISUALS } from './visuals'

const DESIGN_WIDTH = 520

/**
 * A compact project tile. Its preview is the project's animated sketch at small scale:
 * it plays while hovered or focused, and on touch screens while the card sits mid-screen.
 */
export default function ProjectCard({ project: p, index = 0 }: { project: Project; index?: number }) {
  const { reduced, health } = useSite()
  const ref = useRef<HTMLElement>(null)
  const screenRef = useRef<HTMLDivElement>(null)
  const [hot, setHot] = useState(false)
  const [centred, setCentred] = useState(false)
  const [scale, setScale] = useState(0.6)
  const Visual = VISUALS[p.id]
  const h = health[p.id]
  const status = p.live ? (h ? healthLabel(h) : 'Checking') : 'Android app'

  useEffect(() => {
    const el = screenRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / DESIGN_WIDTH))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Touch screens have no hover, so play the preview of whichever card is mid-screen.
  useEffect(() => {
    const el = ref.current
    if (!el || !matchMedia('(hover: none)').matches) return
    const io = new IntersectionObserver(([e]) => setCentred(e.isIntersecting), { rootMargin: '-35% 0px -35% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const move = (e: React.PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
  }

  return (
    <article
      ref={ref}
      className="pcx spot"
      style={{ '--accent': p.accent, '--d': `${index * 70}ms` } as React.CSSProperties}
      onPointerEnter={() => setHot(true)}
      onPointerLeave={() => setHot(false)}
      onFocus={() => setHot(true)}
      onBlur={() => setHot(false)}
      onPointerMove={move}
    >
      <div ref={screenRef} className="pcx-screen" aria-hidden="true">
        <div className="pcx-scale" style={{ width: DESIGN_WIDTH, transform: `scale(${scale})` }}>
          <Visual active={!reduced && (hot || centred)} />
        </div>
        <span className="pcx-glyph" lang="mr">
          {p.glyph}
        </span>
      </div>
      <div className="pcx-body">
        <div className="pcx-head">
          <h3>
            <Link to={`/projects/${p.id}`} className="pcx-link" viewTransition>
              {p.name}
            </Link>
          </h3>
          <span className={`pcx-status dot-wrap`} title={status}>
            <i className={`dot dot-${p.live ? (h?.state ?? 'checking') : 'native'}`} aria-hidden="true" />
            {p.live ? (h?.state === 'online' ? 'Live' : status) : 'Android'}
          </span>
        </div>
        <p className="pcx-tagline">{p.tagline}</p>
        <p className="pcx-stack">{p.stack.slice(0, 3).join(', ')}</p>
      </div>
    </article>
  )
}
