import { useSearchParams } from 'react-router'
import { REPO_URL, projects, type Project } from '../data/projects'
import { usePageMeta } from '../hooks/usePageMeta'
import PageHead from '../components/PageHead'
import ProjectCard from '../components/ProjectCard'

const FILTERS: { id: string; label: string; test: (p: Project) => boolean }[] = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'web', label: 'Web apps', test: (p) => Boolean(p.live) },
  { id: 'android', label: 'Android apps', test: (p) => p.kind === 'Android app' },
]

export default function Projects() {
  usePageMeta('Projects', 'Six side projects by Chinmay Upare: web apps in React and TypeScript, and Android apps in Kotlin.')
  const [params, setParams] = useSearchParams()
  const current = FILTERS.find((f) => f.id === params.get('type')) ?? FILTERS[0]
  const list = projects.filter(current.test)

  return (
    <>
      <PageHead
        title="Projects"
        intro={
          <>
            Each is a complete app in{' '}
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
              one repository
            </a>
            , tested in CI. Hover a card to play its preview; open one for the details.
          </>
        }
      >
        <div className="filters" role="tablist" aria-label="Filter projects">
          {FILTERS.map((f) => {
            const on = f.id === current.id
            const count = projects.filter(f.test).length
            return (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={on}
                className={on ? 'on' : undefined}
                onClick={() => setParams(f.id === 'all' ? {} : { type: f.id }, { replace: true, preventScrollReset: true })}
              >
                {f.label}
                <span>{count}</span>
              </button>
            )
          })}
        </div>
      </PageHead>

      <section className="sec sec-tight" aria-label={current.label}>
        <div className="pgrid" key={current.id}>
          {list.map((p, i) => (
            <ProjectCard key={p.id} project={p} index={i} />
          ))}
        </div>
      </section>
    </>
  )
}
