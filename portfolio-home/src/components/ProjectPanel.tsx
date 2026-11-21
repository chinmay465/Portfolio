import { useRef, type ComponentType } from 'react'
import type { Project } from '../data/projects'
import { healthLabel, type Health } from '../hooks/usePings'
import { useInView, useRevealed } from '../hooks/motion'
import Tilt from './Tilt'
import EkatraVisual from './visuals/EkatraVisual'
import AnkVisual from './visuals/AnkVisual'
import ShodhVisual from './visuals/ShodhVisual'
import SetuVisual from './visuals/SetuVisual'
import KavachVisual from './visuals/KavachVisual'

const VISUALS: Record<Project['id'], ComponentType<{ active: boolean }>> = {
  ekatra: EkatraVisual,
  ank: AnkVisual,
  shodh: ShodhVisual,
  setu: SetuVisual,
  kavach: KavachVisual,
}

interface Props {
  project: Project
  /** Ping result for web apps; absent for the Android app. */
  health?: Health
  reduced: boolean
}

export default function ProjectPanel({ project: p, health, reduced }: Props) {
  const ref = useRef<HTMLElement>(null)
  const artRef = useRef<HTMLDivElement>(null)
  const revealed = useRevealed(ref)
  const visible = useInView(artRef, '80px')
  const Visual = VISUALS[p.id]

  return (
    <article
      ref={ref}
      id={p.id}
      className="proj"
      data-revealed={revealed || reduced}
      style={{ '--accent': p.accent } as React.CSSProperties}
      aria-labelledby={`${p.id}-title`}
    >
      <div ref={artRef} className="proj-art">
        <span className="proj-glyph" lang="mr" aria-hidden="true">
          {p.glyph}
        </span>
        <Tilt reduced={reduced} className="proj-screen">
          <Visual active={visible && !reduced} />
        </Tilt>
      </div>
      <div className="proj-copy">
        <div className="proj-head">
          <h3 id={`${p.id}-title`}>{p.name}</h3>
          {health ? (
            <span className={`pill pill-${health.state}`}>
              <i aria-hidden="true" />
              {healthLabel(health)}
            </span>
          ) : (
            <span className="pill pill-native">
              <i aria-hidden="true" />
              Android app
            </span>
          )}
        </div>
        <p className="proj-meaning">
          <span lang="mr">{p.glyph}</span> means {p.meaning}
        </p>
        <p className="proj-tagline">{p.tagline}</p>
        <ul className="proj-points">
          {p.points.map((pt) => (
            <li key={pt}>{pt}</li>
          ))}
        </ul>
        <p className="proj-stack">{p.stack.join(', ')}</p>
        <div className="proj-actions">
          <a className="btn btn-ink" href={p.live ?? p.download} target="_blank" rel="noopener noreferrer">
            {p.live ? `Open ${p.name}` : 'Get the APK'}
          </a>
          <a className="btn btn-line" href={p.code} target="_blank" rel="noopener noreferrer">
            View the code
          </a>
        </div>
      </div>
    </article>
  )
}
