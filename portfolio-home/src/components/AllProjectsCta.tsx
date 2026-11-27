import { Link } from 'react-router'
import { projects } from '../data/projects'
import { useMagnetic } from '../hooks/motion'

/**
 * A wide call to action under Home's featured projects. Every project's mark sits in a
 * stack that fans out on hover, the border light orbits, and the arrow is magnetic.
 */
export default function AllProjectsCta() {
  const arrow = useMagnetic<HTMLSpanElement>(0.4)
  const web = projects.filter((p) => p.live).length
  const android = projects.filter((p) => p.kind === 'Android app' || Boolean(p.download)).length

  const move = (e: React.PointerEvent<HTMLAnchorElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
  }

  return (
    <Link to="/projects" className="all-cta" onPointerMove={move} viewTransition>
      <span className="all-stack" aria-hidden="true">
        {projects.map((p, i) => (
          <span key={p.id} style={{ '--accent': p.accent, '--i': i, '--n': projects.length } as React.CSSProperties}>
            {p.glyph}
          </span>
        ))}
      </span>
      <span className="all-text">
        <strong>Explore all {projects.length} projects</strong>
        <span>
          {web} web apps and {android} Android apps, each with a live demo or download, its code and the story behind it
        </span>
      </span>
      <span ref={arrow} className="all-arrow" aria-hidden="true">
        <i />
      </span>
    </Link>
  )
}
