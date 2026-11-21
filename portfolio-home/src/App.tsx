import { useEffect, useState } from 'react'
import { GITHUB_URL, REPO_URL, projects, webProjects } from './data/projects'
import { LINKEDIN_URL, about, education, facts, impact, jobs, skills } from './data/profile'
import { useReducedMotion } from './hooks/motion'
import { usePings } from './hooks/usePings'
import GlyphField, { type GlyphColors } from './components/GlyphField'
import ScrambleText from './components/ScrambleText'
import ProjectPanel from './components/ProjectPanel'
import CommandPalette from './components/CommandPalette'
import ScrollProgress from './components/ScrollProgress'
import SectionTitle from './components/SectionTitle'
import ImpactRow from './components/ImpactRow'
import CopyEmail from './components/CopyEmail'

const WORDS: { glyph: string; caption: string }[] = [
  { glyph: 'चिन्मय', caption: 'चिन्मय, my name in Devanagari' },
  ...projects.map((p) => ({ glyph: p.glyph, caption: `${p.glyph}, ${p.name}: ${p.meaning}` })),
]
const CYCLE_MS = 5200
const INK: GlyphColors = { rest: '#1b1a2e', calm: '#3a2a3e', fast: '#fff6ec', dust: 'rgba(27,26,46,0.22)' }

export default function App() {
  const reduced = useReducedMotion()
  const health = usePings(webProjects)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [cycle, setCycle] = useState(0)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    if (reduced) return
    const t = setInterval(() => setCycle((c) => (c + 1) % WORDS.length), CYCLE_MS)
    return () => clearInterval(t)
  }, [reduced])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.matches('input, textarea, [contenteditable]')
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    const onScroll = () => setScrolled(scrollY > 24)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  const word = WORDS[cycle]
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
  const liveCount = webProjects.filter((p) => health[p.id]?.state === 'online').length

  return (
    <>
      <a className="skip" href="#about">
        Skip to content
      </a>

      <header className="nav" data-scrolled={scrolled}>
        <a className="brand" href="#top" aria-label="Chinmay Upare, back to top">
          <span lang="mr" aria-hidden="true">
            चि
          </span>
          Chinmay Upare
        </a>
        <nav aria-label="Sections">
          <a href="#about">About</a>
          <a href="#work">Experience</a>
          <a href="#projects">Projects</a>
          <a href="#contact">Contact</a>
        </nav>
        <button className="nav-jump" type="button" onClick={() => setPaletteOpen(true)}>
          Jump to <kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
        </button>
        <ScrollProgress />
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-inner">
            <div className="hero-field">
              <GlyphField word={word.glyph} colors={INK} reduced={reduced} label={word.caption} />
              <p className="hero-caption" aria-hidden="true">
                <span key={word.glyph}>{word.caption}</span>
                {!reduced && <span className="hero-hint">Run your pointer through it, or click</span>}
              </p>
            </div>

            <div className="hero-copy">
              <div>
                <p className="hero-hello" lang="mr">
                  नमस्कार, I'm
                </p>
                <h1 id="hero-title" className="hero-name">
                  <ScrambleText className="hero-line" text="Chinmay" reduced={reduced} delay={200} />{' '}
                  <ScrambleText className="hero-line" text="Upare" reduced={reduced} delay={420} />
                </h1>
              </div>
              <div className="hero-side">
                <p className="hero-intro">
                  Senior frontend developer. I build design systems, micro-frontends and the KYC, onboarding and
                  payment flows of fintech products, in React, Next.js and TypeScript.
                </p>
                <div className="hero-actions">
                  <a className="btn btn-ink" href="#contact">
                    Get in touch
                  </a>
                  <a className="btn btn-line" href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer">
                    LinkedIn
                  </a>
                  <a className="btn btn-line" href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                    GitHub
                  </a>
                </div>
              </div>
            </div>

            <dl className="hero-facts">
              {facts.map((f) => (
                <div key={f.label}>
                  <dt>{f.label}</dt>
                  <dd>{f.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="band" aria-labelledby="about-title">
          <div id="about" className="wrap">
            <SectionTitle id="about-title" title="About me" marathi="माझ्याविषयी" />
            <div className="about">
              <p className="about-lead">{about.lead}</p>
              <div className="about-body">
                {about.body.map((para) => (
                  <p key={para.slice(0, 24)}>{para}</p>
                ))}
              </div>
            </div>
            <ul className="principles">
              {about.principles.map((pr) => (
                <li key={pr.title}>
                  <h3>{pr.title}</h3>
                  <p>{pr.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="band band-ink" aria-labelledby="impact-title">
          <div className="wrap">
            <SectionTitle id="impact-title" title="Before and after" marathi="फरक">
              <p>Some of what changed because of work I led or shipped.</p>
            </SectionTitle>
            <ol className="impact">
              {impact.map((item) => (
                <ImpactRow key={item.what} item={item} reduced={reduced} />
              ))}
            </ol>
          </div>
        </section>

        <section className="band" aria-labelledby="work-title">
          <div id="work" className="wrap">
            <SectionTitle id="work-title" title="Experience" marathi="अनुभव" />
            <ol className="jobs">
              {jobs.map((job) => (
                <li key={job.company} className="job">
                  <div className="job-side">
                    <h3>{job.company}</h3>
                    <p>{job.place}</p>
                    <p className="job-dates">{job.dates}</p>
                  </div>
                  <div className="job-main">
                    {job.note && <p className="job-note">{job.note}</p>}
                    {job.roles.map((role) => (
                      <div key={role.title} className="role">
                        <h4>
                          {role.title}
                          <span>{role.dates}</span>
                        </h4>
                        <ul>
                          {role.points.map((pt) => (
                            <li key={pt}>{pt}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </li>
              ))}
              <li className="job job-edu">
                <div className="job-side">
                  <h3>Education</h3>
                  <p className="job-dates">{education.dates}</p>
                </div>
                <div className="job-main">
                  <div className="role">
                    <h4>
                      {education.school}
                      <span>{education.grade}</span>
                    </h4>
                    <p>{education.degree}</p>
                  </div>
                </div>
              </li>
            </ol>
          </div>
        </section>

        <section className="band band-mist" aria-labelledby="projects-title">
          <div id="projects" className="wrap">
            <SectionTitle id="projects-title" title="Things I build for myself" marathi="प्रकल्प">
              <p>
                Five side projects, each a complete app in{' '}
                <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
                  one repository
                </a>{' '}
                with tests and CI. The four web apps were pinged from your browser as this page loaded:{' '}
                <strong>{liveCount} of {webProjects.length}</strong> answered so far. The screens are animated sketches
                of what each app does.
              </p>
            </SectionTitle>
            <nav className="proj-index" aria-label="Jump to a project">
              {projects.map((p) => (
                <a key={p.id} href={`#${p.id}`} style={{ '--accent': p.accent } as React.CSSProperties}>
                  <span lang="mr" aria-hidden="true">
                    {p.glyph}
                  </span>
                  {p.name}
                </a>
              ))}
            </nav>
            {projects.map((p) => (
              <ProjectPanel key={p.id} project={p} health={health[p.id]} reduced={reduced} />
            ))}
          </div>
        </section>

        <section className="band" aria-labelledby="skills-title">
          <div id="skills" className="wrap">
            <SectionTitle id="skills-title" title="What I work with" marathi="कौशल्य" />
            <dl className="skills">
              {skills.map((g) => (
                <div key={g.group}>
                  <dt>{g.group}</dt>
                  <dd>
                    <ul>
                      {g.items.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </main>

      <footer id="contact" className="contact" aria-labelledby="contact-title">
        <div className="wrap">
          <SectionTitle id="contact-title" title="Get in touch" marathi="संपर्क">
            <p>Email is the quickest way to reach me. I'm also on LinkedIn and GitHub.</p>
          </SectionTitle>
          <CopyEmail />
          <div className="contact-links">
            <a href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer">
              linkedin.com/in/chinmay-upare
            </a>
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
              github.com/chinmay465
            </a>
          </div>
          <p className="contact-foot">
            Built with React 19 and TypeScript, typeset in Anek, deployed on Render. Source in the{' '}
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
              Portfolio repo
            </a>
            .
          </p>
        </div>
      </footer>

      <CommandPalette key={String(paletteOpen)} open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  )
}
