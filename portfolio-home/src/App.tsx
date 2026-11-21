import { useEffect, useMemo, useState } from 'react'
import { GITHUB_URL, REPO_URL, projects, stack, webProjects, type ProjectId } from './data/projects'
import { useMagnetic, useReducedMotion } from './hooks/motion'
import { healthLabel, usePings, type Health } from './hooks/usePings'
import GlyphField from './components/GlyphField'
import ScrambleText from './components/ScrambleText'
import ProjectPanel from './components/ProjectPanel'
import Marquee from './components/Marquee'
import CommandPalette from './components/CommandPalette'
import Ambient from './components/Ambient'

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
      <a className="skip" href="#projects">
        Skip to projects
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
          <a href="#projects">Projects</a>
          <a href="#stack">Stack</a>
          <a href="#work">Experience</a>
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
                Senior frontend developer at KredX with more than four years of React and TypeScript in production: design
                systems, micro-frontends, KYC and payment flows. On the side I build small, complete apps: four web
                apps that are live right now, and an Android ad blocker.
              </p>
              <div className="hero-actions">
                <a ref={primary} className="btn btn-primary" href="#projects">
                  See the projects
                </a>
                <a ref={secondary} className="btn btn-ghost" href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                  GitHub profile
                </a>
              </div>
            </div>
            <StatusConsole health={health} onFocus={setFocus} />
          </div>
        </section>

        <section id="projects" className="projects" aria-labelledby="projects-title">
          <div className="section-head">
            <h2 id="projects-title">Five apps, built end to end</h2>
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
            <h2 id="stack-title">What I ship with</h2>
            <p>Day-job tooling and the stack behind these projects.</p>
          </div>
          <Marquee items={stack.slice(0, 9)} />
          <Marquee items={stack.slice(9)} reverse />
          <ul className="sr-only">
            {stack.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>

        <section id="work" className="work" aria-labelledby="work-title">
          <div className="section-head">
            <h2 id="work-title">Where I work</h2>
          </div>
          <ol className="timeline">
            <li className="now">
              <span className="tl-when">Now</span>
              <div>
                <h3>KredX</h3>
                <p className="tl-role">Senior frontend developer</p>
                <p>KYC flows, payment integrations and a versioned design-system package published to npm.</p>
              </div>
            </li>
            <li>
              <span className="tl-when">Before</span>
              <div>
                <h3>Paytm Money and Paytm</h3>
                <p className="tl-role">Promoted from Software Engineer to Senior Software Engineer at Paytm Money</p>
              </div>
            </li>
          </ol>
        </section>
      </main>

      <footer className="footer">
        <p className="footer-big" aria-hidden="true">
          एकत्र अंक शोध सेतु कवच
        </p>
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
