import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GITHUB_URL, REPO_URL, projects, webProjects } from './data/projects'
import { LINKEDIN_URL, about, education, facts, impact, jobs, journey, skills } from './data/profile'
import { useReducedMotion } from './hooks/motion'
import { usePings } from './hooks/usePings'
import { useActiveScene } from './hooks/useActiveScene'
import ParticleStage, { type Scene, type StageHandle } from './components/ParticleStage'
import ScrambleText from './components/ScrambleText'
import ProjectPanel from './components/ProjectPanel'
import CommandPalette from './components/CommandPalette'
import ScrollProgress from './components/ScrollProgress'
import SectionTitle from './components/SectionTitle'
import ImpactRow from './components/ImpactRow'
import CopyEmail from './components/CopyEmail'
import Journey from './components/Journey'
import ChapterRail from './components/ChapterRail'

const SAFFRON = '#ff7a1a'

const CHAPTERS = [
  { id: 'top', scene: 'hero', mr: 'सुरुवात', en: 'Hello' },
  { id: 'about', scene: 'about', mr: 'माझ्याविषयी', en: 'About' },
  { id: 'journey', scene: 'journey', mr: 'प्रवास', en: 'Journey' },
  { id: 'impact', scene: 'impact', mr: 'फरक', en: 'Impact' },
  { id: 'work', scene: 'work', mr: 'अनुभव', en: 'Experience' },
  { id: 'projects', scene: 'project', mr: 'प्रकल्प', en: 'Projects' },
  { id: 'skills', scene: 'skills', mr: 'कौशल्य', en: 'Skills' },
  { id: 'contact', scene: 'contact', mr: 'संपर्क', en: 'Contact' },
]

const CAPTIONS: Record<string, string> = {
  hero: 'चिन्मय, my name in Devanagari',
  about: 'नमस्कार, hello',
  contact: 'पुन्हा भेटू, see you again',
}

export default function App() {
  const reduced = useReducedMotion()
  const health = usePings(webProjects)
  const active = useActiveScene('hero')
  const stageRef = useRef<StageHandle>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [journeyStage, setJourneyStage] = useState(0)
  const onStage = useCallback((i: number) => setJourneyStage(i), [])

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

  // What the particles spell in each chapter.
  const scene = useMemo<Scene | null>(() => {
    if (active === 'hero') return { word: 'चिन्मय', color: SAFFRON, anchor: 'center' }
    if (active === 'about') return { word: 'नमस्कार', color: SAFFRON, anchor: 'right' }
    if (active === 'journey') return { word: journey[journeyStage].glyph, color: SAFFRON, anchor: 'right' }
    if (active === 'contact') return { word: 'पुन्हा भेटू', color: SAFFRON, anchor: 'right' }
    if (active.startsWith('project:')) {
      const p = projects.find((x) => `project:${x.id}` === active)
      if (p) return { word: p.glyph, color: p.accent, anchor: 'right-top' }
    }
    return null
  }, [active, journeyStage])

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
  const liveCount = webProjects.filter((p) => health[p.id]?.state === 'online').length

  return (
    <>
      <a className="skip" href="#about">
        Skip to content
      </a>
      <ParticleStage ref={stageRef} scene={scene} reduced={reduced} />
      <div className="vignette" aria-hidden="true" />

      <header className="nav">
        <a className="brand" href="#top" aria-label="Chinmay Upare, back to top">
          <span lang="mr" aria-hidden="true">
            चि
          </span>
          Chinmay Upare
        </a>
        <nav aria-label="Sections">
          <a href="#about">About</a>
          <a href="#journey">Journey</a>
          <a href="#projects">Projects</a>
          <a href="#contact">Contact</a>
        </nav>
        <button className="nav-jump" type="button" onClick={() => setPaletteOpen(true)}>
          Jump to <kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
        </button>
        <ScrollProgress />
      </header>

      <ChapterRail chapters={CHAPTERS} active={active} />

      <main id="top">
        <section
          className="hero"
          data-scene="hero"
          aria-labelledby="hero-title"
          onPointerDown={(e) => {
            if (!(e.target as Element).closest('a, button')) stageRef.current?.burst(e.clientX, e.clientY)
          }}
        >
          <p className="hero-caption" aria-hidden="true">
            <span>{CAPTIONS.hero}</span>
            {!reduced && <span className="hero-hint">Move through the letters, or click anywhere here</span>}
          </p>
          <div className="hero-copy">
            <div>
              <p className="hero-hello" lang="mr">
                नमस्कार, I'm
              </p>
              <h1 id="hero-title" className="hero-name">
                <ScrambleText className="hero-line" text="Chinmay" reduced={reduced} delay={500} />{' '}
                <ScrambleText className="hero-line" text="Upare" reduced={reduced} delay={720} />
              </h1>
            </div>
            <div className="hero-side">
              <p className="hero-intro">
                Senior frontend developer. I build design systems, micro-frontends and the KYC, onboarding and payment
                flows of fintech products, in React, Next.js and TypeScript.
              </p>
              <div className="hero-actions">
                <a className="btn btn-glow" href="#journey">
                  Scroll my story
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
        </section>

        <section id="about" className="chapter about" data-scene="about" aria-labelledby="about-title">
          <div className="half">
            <SectionTitle id="about-title" title="About me" marathi="माझ्याविषयी" />
            <p className="about-lead">{about.lead}</p>
            <div className="about-body">
              {about.body.map((para) => (
                <p key={para.slice(0, 24)}>{para}</p>
              ))}
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
          <p className="scene-caption" aria-hidden="true">
            {CAPTIONS.about}
          </p>
        </section>

        <Journey onStage={onStage} />

        <section id="impact" className="chapter" data-scene="impact" aria-labelledby="impact-title">
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

        <section id="work" className="chapter" data-scene="work" aria-labelledby="work-title">
          <div className="wrap">
            <SectionTitle id="work-title" title="Experience" marathi="अनुभव">
              <p>The full record, role by role.</p>
            </SectionTitle>
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
              <li className="job">
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

        <section id="projects" className="projects" aria-labelledby="projects-title">
          <div className="wrap chapter-head" data-scene="project:intro">
            <SectionTitle id="projects-title" title="Things I build for myself" marathi="प्रकल्प">
              <p>
                Five side projects, each a complete app in{' '}
                <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
                  one repository
                </a>{' '}
                with tests and CI. The four web apps were pinged from your browser as this page loaded:{' '}
                <strong>
                  {liveCount} of {webProjects.length}
                </strong>{' '}
                answered so far.
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
          </div>
          {projects.map((p) => (
            <ProjectPanel key={p.id} project={p} health={health[p.id]} reduced={reduced} />
          ))}
        </section>

        <section id="skills" className="chapter" data-scene="skills" aria-labelledby="skills-title">
          <div className="wrap">
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

      <footer id="contact" className="contact" data-scene="contact" aria-labelledby="contact-title">
        <div className="half">
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
        </div>
        <p className="scene-caption" aria-hidden="true">
          {CAPTIONS.contact}
        </p>
        <p className="contact-foot">
          Built with React 19 and TypeScript, typeset in Anek, deployed on Render. Source in the{' '}
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
            Portfolio repo
          </a>
          .
        </p>
      </footer>

      <CommandPalette key={String(paletteOpen)} open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  )
}
