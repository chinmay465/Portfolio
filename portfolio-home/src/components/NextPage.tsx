import { Link } from 'react-router'

/** A large link to the next page at the bottom of each inner page, so reading flows on. */
export default function NextPage({ to, label, hint }: { to: string; label: string; hint: string }) {
  return (
    <Link to={to} className="next-page" viewTransition>
      <span className="next-hint">{hint}</span>
      <span className="next-label">
        {label}
        <i aria-hidden="true" />
      </span>
    </Link>
  )
}
