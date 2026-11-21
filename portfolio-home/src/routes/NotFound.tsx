import { Link, useRouteError } from 'react-router'
import { usePageMeta } from '../hooks/usePageMeta'
import { useReducedMotion } from '../hooks/motion'
import ScrambleText from '../components/ScrambleText'

/** Unknown paths, unknown project ids, and any error thrown while rendering a page. */
export default function NotFound() {
  const error = useRouteError()
  const reduced = useReducedMotion()
  usePageMeta('Page not found', 'This page does not exist.')
  return (
    <section className="notfound">
      <p className="nf-code">
        <ScrambleText text={error ? 'Error' : '404'} reduced={reduced} duration={900} />
      </p>
      <h1>{error ? 'Something broke on this page' : 'This page does not exist'}</h1>
      <p>{error ? 'Reload to try again, or head back home.' : 'The link may be old, or the address mistyped.'}</p>
      <div className="nf-actions">
        <Link className="btn btn-primary" to="/">
          Go home
        </Link>
        <Link className="btn btn-ghost" to="/projects">
          See projects
        </Link>
      </div>
    </section>
  )
}
