import { useRef, type ReactNode } from 'react'
import { useRevealed } from '../hooks/motion'

interface Props {
  id: string
  title: string
  /** The same heading in Marathi, set large behind the English one. */
  marathi: string
  children?: ReactNode
}

export default function SectionTitle({ id, title, marathi, children }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const seen = useRevealed(ref)
  return (
    <div ref={ref} className="sec-title" data-seen={seen}>
      <span className="sec-mr" lang="mr" aria-hidden="true">
        {marathi}
      </span>
      <h2 id={id}>{title}</h2>
      {children && <div className="sec-intro">{children}</div>}
    </div>
  )
}
