import { useRef } from 'react'
import { useRevealed } from '../hooks/motion'

interface Props {
  id: string
  text: string
  className?: string
}

/** A section heading that rises out of a mask the first time it scrolls into view. */
export default function RevealHeading({ id, text, className = '' }: Props) {
  const ref = useRef<HTMLHeadingElement>(null)
  const seen = useRevealed(ref)
  return (
    <h2 ref={ref} id={id} className={`reveal-h ${className}`} data-seen={seen}>
      <span className="reveal-mask">
        <span className="reveal-inner">{text}</span>
      </span>
    </h2>
  )
}
