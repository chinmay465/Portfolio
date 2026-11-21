import type { ProjectId } from '../data/projects'
import { projects } from '../data/projects'
import type { Health } from '../hooks/usePings'
import { healthLabel } from '../hooks/usePings'
import { education } from '../data/profile'

interface Props {
  health: Partial<Record<ProjectId, Health>>
  onFocus: (id: ProjectId | null) => void
}

const FOCUS = ['Design systems', 'Micro-frontends', 'KYC and payments', 'Web performance']
const STACK = ['React', 'Next.js', 'TypeScript', 'React Query']

/** The hero's summary panel: who I am in five rows, plus the side projects with live status. */
export default function ProfileCard({ health, onFocus }: Props) {
  return (
    <section className="console pcard" aria-labelledby="pcard-title">
      <div className="console-head">
        <h2 id="pcard-title">At a glance</h2>
        <a href="#contact" className="pcard-open">
          <i aria-hidden="true" />
          Get in touch
        </a>
      </div>
      <dl className="pcard-rows">
        <div style={{ '--i': 0 } as React.CSSProperties}>
          <dt>Now</dt>
          <dd>
            <strong>Senior Frontend Developer, KredX</strong>
            <span>Bangalore, since Sep 2025</span>
          </dd>
        </div>
        <div style={{ '--i': 1 } as React.CSSProperties}>
          <dt>Before</dt>
          <dd>
            <strong>Paytm Money, Pune</strong>
            <span>Software Engineer to Senior, 2022 – 2025</span>
          </dd>
        </div>
        <div style={{ '--i': 2 } as React.CSSProperties}>
          <dt>Focus</dt>
          <dd>
            <ul className="pcard-tags">
              {FOCUS.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </dd>
        </div>
        <div style={{ '--i': 3 } as React.CSSProperties}>
          <dt>Stack</dt>
          <dd>
            <ul className="pcard-tags">
              {STACK.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </dd>
        </div>
        <div style={{ '--i': 4 } as React.CSSProperties}>
          <dt>Studied</dt>
          <dd>
            <strong>{education.degree}</strong>
            <span>
              {education.school}, {education.grade}
            </span>
          </dd>
        </div>
        <div style={{ '--i': 5 } as React.CSSProperties}>
          <dt>Side projects</dt>
          <dd>
            <ul className="pcard-projects">
              {projects.map((p) => {
                const h = health[p.id]
                const label = p.live ? (h ? healthLabel(h) : 'Checking') : 'Android app'
                return (
                  <li key={p.id}>
                    <a
                      href={`#${p.id}`}
                      style={{ '--accent': p.accent } as React.CSSProperties}
                      onPointerEnter={() => onFocus(p.id)}
                      onPointerLeave={() => onFocus(null)}
                      onFocus={() => onFocus(p.id)}
                      onBlur={() => onFocus(null)}
                      title={`${p.name}: ${label}`}
                    >
                      <i className={`dot dot-${p.live ? (h?.state ?? 'checking') : 'native'}`} aria-hidden="true" />
                      {p.name}
                      <span className="sr-only">, {label}</span>
                    </a>
                  </li>
                )
              })}
            </ul>
          </dd>
        </div>
      </dl>
    </section>
  )
}
