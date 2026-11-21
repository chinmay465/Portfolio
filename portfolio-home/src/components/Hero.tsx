import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { projects, type ProjectId } from '../data/projects'
import { heroSkills } from '../data/profile'
import { useMagnetic } from '../hooks/motion'
import { useSite } from '../context/site'
import ProfileCard from './ProfileCard'
import GlyphField from './GlyphField'
import ScrambleText from './ScrambleText'

const CYCLE_MS = 4200

/** Home hero: the particle skills board, the name, the intro and the At a glance card. */
export default function Hero() {
  const { reduced, health } = useSite()
  const [skill, setSkill] = useState(0)
  const [paused, setPaused] = useState(false)
  const dockRef = useRef<HTMLUListElement>(null)
  const [focus, setFocus] = useState<ProjectId | null>(null)
  const primary = useMagnetic<HTMLAnchorElement>(0.3)
  const secondary = useMagnetic<HTMLAnchorElement>(0.3)

  useEffect(() => {
    if (reduced || focus || paused) return
    const t = setInterval(() => setSkill((c) => (c + 1) % heroSkills.length), CYCLE_MS)
    return () => clearInterval(t)
  }, [reduced, focus, paused, skill])

  // On narrow screens the chips scroll sideways: keep the current one in view.
  useEffect(() => {
    const dock = dockRef.current
    const chip = dock?.children[skill] as HTMLElement | undefined
    if (dock && chip && dock.scrollWidth > dock.clientWidth) {
      dock.scrollTo({ left: chip.offsetLeft - dock.clientWidth / 2 + chip.offsetWidth / 2, behavior: 'smooth' })
    }
  }, [skill])

  // The field spells the current skill, or a project's name while one is hovered in the card.
  const word = useMemo(() => {
    const p = focus ? projects.find((x) => x.id === focus) : undefined
    if (p) return { glyph: p.glyph, accent: p.accent, caption: `${p.name}: ${p.tagline}` }
    const sk = heroSkills[skill]
    return { glyph: sk.word, accent: sk.accent, caption: sk.detail }
  }, [focus, skill])

  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-field" style={{ '--accent': word.accent } as React.CSSProperties}>
        <GlyphField word={word.glyph} accent={word.accent} reduced={reduced} label={`${word.glyph}. ${word.caption}`} />
        <div className="skill-board">
          <p className="skill-caption" aria-live="polite">
            <span key={word.caption}>{word.caption}</span>
          </p>
          <ul
            ref={dockRef}
            className="skill-dock"
            aria-label="Skills"
            onPointerEnter={() => setPaused(true)}
            onPointerLeave={() => setPaused(false)}
          >
            {heroSkills.map((sk, i) => {
              const on = !focus && i === skill
              return (
                <li key={sk.label}>
                  <button
                    type="button"
                    className={on ? 'on' : undefined}
                    aria-pressed={on}
                    style={{ '--accent': sk.accent } as React.CSSProperties}
                    onPointerEnter={() => setSkill(i)}
                    onFocus={() => setSkill(i)}
                    onClick={() => setSkill(i)}
                  >
                    {sk.label}
                    {on && !reduced && (
                      <i
                        className="skill-timer"
                        key={skill}
                        style={{ animationDuration: `${CYCLE_MS}ms`, animationPlayState: paused ? 'paused' : 'running' }}
                        aria-hidden="true"
                      />
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      <h1 id="hero-title" className="hero-name">
        <ScrambleText className="hero-line" text="Chinmay" reduced={reduced} delay={250} />{' '}
        <ScrambleText className="hero-line" text="Upare" reduced={reduced} delay={450} />
      </h1>

      <div className="hero-grid">
        <div className="hero-intro">
          <p>
            Senior frontend developer at KredX in Bangalore, with 4+ years building fintech products in React,
            Next.js and TypeScript: design systems, micro-frontends, and the KYC, onboarding and payment flows
            where a bug costs real money.
          </p>
          <div className="hero-actions">
            <Link ref={primary} className="btn btn-primary" to="/projects" viewTransition>
              See my work
            </Link>
            <Link ref={secondary} className="btn btn-ghost" to="/about" viewTransition>
              About me
            </Link>
          </div>
        </div>
        <ProfileCard health={health} onFocus={setFocus} />
      </div>
    </section>
  )
}
