import { useEffect, useMemo, useRef, useState } from 'react'
import { GITHUB_URL, REPO_URL, projects, webProjects, type ProjectId } from './data/projects'
import { useMagnetic, useReducedMotion } from './hooks/motion'
import { usePings } from './hooks/usePings'
import ProfileCard from './components/ProfileCard'
import GlyphField from './components/GlyphField'
import ScrambleText from './components/ScrambleText'
import ProjectPanel from './components/ProjectPanel'
import Marquee from './components/Marquee'
import CommandPalette from './components/CommandPalette'
import Ambient from './components/Ambient'
import RevealHeading from './components/RevealHeading'
import ScrollWords from './components/ScrollWords'
import Spot from './components/Spot'
import Journey from './components/Journey'
import Experience from './components/Experience'
import ImpactRow from './components/ImpactRow'
import CopyEmail from './components/CopyEmail'
import { LINKEDIN_URL, about, heroSkills, impact, skills } from './data/profile'

const CYCLE_MS = 4200

export default function App() {
  const reduced = useReducedMotion()
  const health = usePings(webProjects)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [skill, setSkill] = useState(0)
  const [paused, setPaused] = useState(false)
  const dockRef = useRef<HTMLUListElement>(null)
  const [focus, setFocus] = useState<ProjectId | null>(null)
  const primary = useMagnetic<HTMLAnchorElement>(0.3)
  const secondary = useMagnetic<HTMLAnchorElement>(0.3)
  const contactCta = useMagnetic<HTMLAnchorElement>(0.35)
  const skillWords = skills.flatMap((g) => g.items)

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.matches('input, textarea, [contenteditable]')
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // The field spells the current skill, or a project's name while one is hovered in the card.
  const word = useMemo(() => {
    const p = focus ? projects.find((x) => x.id === focus) : undefined
    if (p) return { glyph: p.glyph, accent: p.accent, caption: `${p.name}: ${p.tagline}` }
    const sk = heroSkills[skill]
    return { glyph: sk.word, accent: sk.accent, caption: sk.detail }
  }, [focus, skill])
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

  return (
    <>
      <a className="skip" href="#about">
        Skip to content
      </a>
      <Ambient reduced={reduced} />

      <header className="nav">
        <a className="brand" href="#top" aria-label="Chinmay Upare, back to top">
          <span className="brand-mark" aria-hidden="true">
            चि
          </span>
          <span className="brand-name">Chinmay Upare</span>
        </a>
        <nav aria-label="Sections">
          <a href="#about">About</a>
          <a href="#journey">Journey</a>
          <a href="#projects">Projects</a>
          <a href="#contact">Contact</a>
        </nav>
        <button className="nav-jump" type="button" onClick={() => setPaletteOpen(true)}>
          Jump to
          <kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
        </button>
      </header>

      <main id="top">
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
                <a ref={primary} className="btn btn-primary" href="#journey">
                  See my journey
                </a>
                <a ref={secondary} className="btn btn-ghost" href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer">
                  LinkedIn
                </a>
              </div>
            </div>
            <ProfileCard health={health} onFocus={setFocus} />
          </div>
        </section>

        <section id="about" className="about" aria-labelledby="about-title">
          <div className="section-head">
            <RevealHeading id="about-title" text="About me" />
          </div>
          <div className="about-grid">
            <ScrollWords className="about-lead" text={about.lead} reduced={reduced} />
            <div className="about-body">
              {about.body.map((para) => (
                <p key={para.slice(0, 24)}>{para}</p>
              ))}
            </div>
          </div>
          <ul className="principles">
            {about.principles.map((pr) => (
              <Spot as="li" key={pr.title}>
                <h3>{pr.title}</h3>
                <p>{pr.text}</p>
              </Spot>
            ))}
          </ul>
        </section>

        <Journey reduced={reduced} />

        <section id="impact" className="impact-sec" aria-labelledby="impact-title">
          <div className="section-head">
            <RevealHeading id="impact-title" text="Before and after" />
            <p>Results from work I led or shipped at KredX and Paytm Money.</p>
          </div>
          <ol className="impact">
            {impact.map((item) => (
              <ImpactRow key={item.what} item={item} reduced={reduced} />
            ))}
          </ol>
        </section>

        <section id="work" className="work" aria-labelledby="work-title">
          <div className="section-head">
            <RevealHeading id="work-title" text="Experience" />
            <p>Every role in full. Open one to read what I shipped there.</p>
          </div>
          <Experience />
        </section>

        <section id="projects" className="projects" aria-labelledby="projects-title">
          <div className="section-head">
            <RevealHeading id="projects-title" text="Things I build for fun" />
            <p>
              Each is its own project in{' '}
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
                one repository
              </a>
              , tested in CI. The four React and TypeScript web apps deploy from a single Render Blueprint, and each
              Android app's APK is built and privacy-checked on every push. The previews beside them are animated
              sketches of what each app does.
            </p>
          </div>
          {projects.map((p) => (
            <ProjectPanel key={p.id} project={p} health={health[p.id]} reduced={reduced} />
          ))}
        </section>

        <section id="stack" className="stack" aria-labelledby="stack-title">
          <div className="section-head">
            <RevealHeading id="stack-title" text="What I work with" />
            <p>Day-job tooling and the stack behind these projects.</p>
          </div>
          <Marquee items={skillWords.slice(0, Math.ceil(skillWords.length / 2))} />
          <Marquee items={skillWords.slice(Math.ceil(skillWords.length / 2))} reverse />
          <dl className="sr-only">
            {skills.map((g) => (
              <div key={g.group}>
                <dt>{g.group}</dt>
                <dd>{g.items.join(', ')}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="contact" className="contact" aria-labelledby="contact-title">
          <Spot className="contact-card">
            <RevealHeading id="contact-title" text="Let's build something" />
            <p className="contact-intro">Email is the quickest way to reach me. I'm also on LinkedIn and GitHub.</p>
            <CopyEmail />
            <div className="contact-actions">
              <a ref={contactCta} className="btn btn-primary" href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer">
                Connect on LinkedIn
              </a>
              <a className="btn btn-ghost" href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                GitHub
              </a>
            </div>
          </Spot>
        </section>
      </main>

      <footer className="footer">
        <div className="footer-row">
          <p>
            Built with React 19 and TypeScript, deployed on Render. This page lives in the{' '}
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
              Portfolio repo
            </a>{' '}
            too.
          </p>
          <button className="nav-jump" type="button" onClick={() => setPaletteOpen(true)}>
            Jump anywhere
            <kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
          </button>
        </div>
      </footer>

      <CommandPalette key={String(paletteOpen)} open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  )
}
