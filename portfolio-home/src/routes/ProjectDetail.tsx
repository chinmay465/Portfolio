import { Link, useParams } from 'react-router'
import { projects } from '../data/projects'
import { usePageMeta } from '../hooks/usePageMeta'
import { useSite } from '../context/site'
import PageHead from '../components/PageHead'
import ProjectPanel from '../components/ProjectPanel'
import NotFound from './NotFound'

export default function ProjectDetail() {
  const { id } = useParams()
  const { reduced, health } = useSite()
  const i = projects.findIndex((p) => p.id === id)
  const p = projects[i]
  usePageMeta(p ? p.name : 'Not found', p ? `${p.name}: ${p.tagline}` : 'This project does not exist.')
  if (!p) return <NotFound />

  const prev = projects[(i - 1 + projects.length) % projects.length]
  const next = projects[(i + 1) % projects.length]

  return (
    <>
      <PageHead title={p.name} crumbs={[{ to: '/projects', label: 'Projects' }]} intro={p.tagline} />
      <section className="sec sec-tight detail" aria-label={p.name}>
        <ProjectPanel project={p} health={health[p.id]} reduced={reduced} />
      </section>
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
