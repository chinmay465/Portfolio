import { Suspense, lazy, useEffect } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { projects } from '../data/projects'
import { usePageMeta } from '../hooks/usePageMeta'
import { useSite } from '../context/site'
import PageHead from '../components/PageHead'
import ProjectPanel from '../components/ProjectPanel'
import NotFound from './NotFound'

const SwarDemo = lazy(() => import('../components/demos/SwarDemo'))

export default function ProjectDetail() {
  const { id } = useParams()
  const { reduced, health } = useSite()
  const { hash } = useLocation()
  const i = projects.findIndex((p) => p.id === id)
  const p = projects[i]
  usePageMeta(p ? p.name : 'Not found', p ? `${p.name}: ${p.tagline}` : 'This project does not exist.')
  const hasDemo = Boolean(p?.demo)
  // "Try the demo" links land on the demo.
  useEffect(() => {
    if (hash !== '#demo' || !hasDemo) return
    const t = setTimeout(() => document.getElementById('demo')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' }), 120)
    return () => clearTimeout(t)
  }, [hash, hasDemo, reduced])
  if (!p) return <NotFound />

  const prev = projects[(i - 1 + projects.length) % projects.length]
  const next = projects[(i + 1) % projects.length]

  return (
    <>
      <PageHead title={p.name} crumbs={[{ to: '/projects', label: 'Projects' }]} intro={p.tagline} />
      <section className="sec sec-tight detail" aria-label={p.name}>
        <ProjectPanel project={p} health={health[p.id]} reduced={reduced} />
      </section>
      {p.id === 'swar' && (
        <section id="demo" className="sec sec-tight demo" aria-labelledby="demo-title">
          <div className="demo-copy">
            <h2 id="demo-title">Try it</h2>
            <p>
              Swar's screens, working, on made-up music. The app itself lives in a private repository, so this is the
              way to see it.
            </p>
            <ul>
              <li>Tap a song to start its radio, or open an album and press Play.</li>
              <li>Swipe the mini player up to open the player, and the player down to close it.</li>
              <li>Play Paper Boats and flip the Song | Video switch at the top of the player.</li>
              <li>Library shows your listening pulse and On repeat; save a song to a playlist from its ⋮ menu.</li>
              <li>The gear in Library opens Settings: song or video, audio quality and cache size.</li>
            </ul>
            <small>Nothing plays out loud: playback is simulated.</small>
          </div>
          <Suspense fallback={<div className="sd-phone" aria-hidden="true" />}>
            <SwarDemo reduced={reduced} />
          </Suspense>
        </section>
      )}
      <nav className="sec sec-tight pager" aria-label="More projects">
        <Link to={`/projects/${prev.id}`} className="pager-link" style={{ '--accent': prev.accent } as React.CSSProperties} viewTransition>
          <span className="pager-hint">Previous</span>
          <span className="pager-name">{prev.name}</span>
        </Link>
        <Link to="/projects" className="pager-all" viewTransition>
          All projects
        </Link>
        <Link
          to={`/projects/${next.id}`}
          className="pager-link pager-next"
          style={{ '--accent': next.accent } as React.CSSProperties}
          viewTransition
        >
          <span className="pager-hint">Next</span>
          <span className="pager-name">{next.name}</span>
        </Link>
      </nav>
    </>
  )
}
