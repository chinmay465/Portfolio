import { useRef, type ComponentType } from 'react'
import type { Project } from '../data/projects'
import { healthLabel, type Health } from '../hooks/usePings'
import { useInView, useMagnetic, useRevealed } from '../hooks/motion'
import Tilt from './Tilt'
import EkatraVisual from './visuals/EkatraVisual'
import AnkVisual from './visuals/AnkVisual'
import ShodhVisual from './visuals/ShodhVisual'
import SetuVisual from './visuals/SetuVisual'

const VISUALS: Record<Project['id'], ComponentType<{ active: boolean }>> = {
  ekatra: EkatraVisual,
  ank: AnkVisual,
  shodh: ShodhVisual,
  setu: SetuVisual,
}

interface Props {
  project: Project
  health: Health
  reduced: boolean
}

export default function ProjectPanel({ project: p, health, reduced }: Props) {
  const ref = useRef<HTMLElement>(null)
  const visRef = useRef<HTMLDivElement>(null)
  const revealed = useRevealed(ref)
  const visible = useInView(visRef, '80px')
  const cta = useMagnetic<HTMLAnchorElement>(0.25)
  const Visual = VISUALS[p.id]

  return (
    <article
      ref={ref}
      id={p.id}
      className="panel"
      data-revealed={revealed || reduced}
      style={{ '--accent': p.accent } as React.CSSProperties}
      aria-labelledby={`${p.id}-title`}
    >
      <div className="panel-copy">
        <svg className="panel-glyph" viewBox="0 0 600 210" aria-hidden="true">
          <text x="4" y="150">
            {p.glyph}
          </text>
        </svg>
        <div className="panel-heading">
          <h3 id={`${p.id}-title`}>{p.name}</h3>
          <span className={`pill pill-${health.state}`}>
            <i aria-hidden="true" />
            {healthLabel(health)}
          </span>
        </div>
        <p className="panel-meaning">
          {p.glyph} means {p.meaning}. {p.kind} on Render.
        </p>
        <p className="panel-tagline">{p.tagline}</p>
        <ul className="panel-points">
          {p.points.map((pt) => (
            <li key={pt}>{pt}</li>
          ))}
        </ul>
        <ul className="chips" aria-label="Built with">
          {p.stack.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <div className="panel-actions">
          <a
            ref={cta}
            className="btn btn-primary"
            href={p.live}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open {p.name}
          </a>
          <a className="btn btn-ghost" href={p.code} target="_blank" rel="noopener noreferrer">
            View the code
          </a>
        </div>
      </div>
      <div ref={visRef} className="panel-visual">
        <Tilt reduced={reduced}>
          <Visual active={visible && !reduced} />
        </Tilt>
      </div>
    </article>
  )
}
