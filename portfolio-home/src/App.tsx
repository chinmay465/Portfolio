import { useEffect, useMemo, useState } from 'react'
import { GITHUB_URL, REPO_URL, projects, webProjects, type ProjectId } from './data/projects'
import { useMagnetic, useReducedMotion } from './hooks/motion'
import { healthLabel, usePings, type Health } from './hooks/usePings'
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
import { LINKEDIN_URL, about, impact, skills } from './data/profile'

const WORDS = [
  { id: null, glyph: 'चिन्मय', accent: '#ff9933', caption: 'चिन्मय is my name, written in Devanagari' },
  ...projects.map((p) => ({ id: p.id, glyph: p.glyph, accent: p.accent, caption: `${p.glyph} is ${p.name}, meaning ${p.meaning}` })),
]
const CYCLE_MS = 5200

function Spark({ history }: { history: number[] }) {
  const max = Math.max(400, ...history)
  return (
    <span className="spark" aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => {
        const v = history[history.length - 10 + i]
        return <i key={i} style={{ height: v ? `${Math.max(12, (v / max) * 100)}%` : '12%', opacity: v ? 1 : 0.25 }} />
      })}
    </span>
  )
}

function StatusConsole({
  health,
  onFocus,
}: {
  health: Partial<Record<ProjectId, Health>>
  onFocus: (id: ProjectId | null) => void
}) {
  return (
    <section className="console" aria-labelledby="console-title">
      <div className="console-head">
        <h2 id="console-title">Live right now</h2>
        <p>Web apps pinged from your browser as this page loaded</p>
      </div>
      <ul>
        {projects.map((p) => {
          // The Android app has no URL to ping; it gets a static badge instead.
          const h = p.live ? (health[p.id] ?? { state: 'checking' as const, history: [] }) : undefined
          return (
            <li key={p.id} style={{ '--accent': p.accent } as React.CSSProperties}>
              <a
                href={p.live ?? p.download}
                target="_blank"
                rel="noopener noreferrer"
                onPointerEnter={() => onFocus(p.id)}
                onPointerLeave={() => onFocus(null)}
                onFocus={() => onFocus(p.id)}
                onBlur={() => onFocus(null)}
              >
                <span className="console-glyph" aria-hidden="true">
                  {p.glyph}
                </span>
                <span className="console-name">{p.name}</span>
                {h ? (
                  <>
                    <span className={`console-state pill-${h.state}`}>
                      <i aria-hidden="true" />
                      {healthLabel(h)}
                    </span>
                    <Spark history={h.history} />
                  </>
                ) : (
                  <>
                    <span className="console-state pill-native">
                      <i aria-hidden="true" />
                      Android app
                    </span>
                    <span className="spark" aria-hidden="true" />
                  </>
                )}
              </a>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export default function App() {
  const reduced = useReducedMotion()
  const health = usePings(webProjects)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [cycle, setCycle] = useState(0)
  const [focus, setFocus] = useState<ProjectId | null>(null)
  const primary = useMagnetic<HTMLAnchorElement>(0.3)
  const secondary = useMagnetic<HTMLAnchorElement>(0.3)
  const contactCta = useMagnetic<HTMLAnchorElement>(0.35)
  const skillWords = skills.flatMap((g) => g.items)

  useEffect(() => {
    if (reduced || focus) return
    const t = setInterval(() => setCycle((c) => (c + 1) % WORDS.length), CYCLE_MS)
    return () => clearInterval(t)
  }, [reduced, focus])

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

  const word = useMemo(() => (focus ? WORDS.find((w) => w.id === focus)! : WORDS[cycle]), [focus, cycle])
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
          <div className="hero-field">
            <GlyphField word={word.glyph} accent={word.accent} reduced={reduced} label={word.caption} />
            <div className="hero-caption">
              <span key={word.glyph} className="hero-caption-text">
                {word.caption}
              </span>
              <span className="hero-hint">{reduced ? '' : 'Move through the letters, or click to scatter them'}</span>
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
                <a ref={secondary} className="btn btn-ghost" href="#contact">
                  Get in touch
                </a>
              </div>
            </div>
            <StatusConsole health={health} onFocus={setFocus} />
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
              , tested in CI. The four React and TypeScript web apps deploy from a single Render Blueprint, and the
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
