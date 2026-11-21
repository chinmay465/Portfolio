import type { ReactNode } from 'react'
import { Link } from 'react-router'
import ScrambleText from './ScrambleText'
import { useSite } from '../context/site'

interface Props {
  title: string
  intro?: ReactNode
  /** Breadcrumb trail above the title, e.g. Projects for a project page. */
  crumbs?: { to: string; label: string }[]
  children?: ReactNode
}

/** The top of every inner page: breadcrumb, a decoding title and a one-line intro. */
export default function PageHead({ title, intro, crumbs, children }: Props) {
  const { reduced } = useSite()
  return (
    <header className="page-head">
      <nav className="crumbs" aria-label="Breadcrumb">
        <ol>
          <li>
            <Link to="/">Home</Link>
          </li>
          {crumbs?.map((c) => (
            <li key={c.to}>
              <Link to={c.to}>{c.label}</Link>
            </li>
          ))}
          <li aria-current="page">{title}</li>
        </ol>
      </nav>
      <h1 className="page-title">
        <ScrambleText text={title} reduced={reduced} duration={700} />
      </h1>
      {intro && <p className="page-intro">{intro}</p>}
      {children}
    </header>
  )
}
