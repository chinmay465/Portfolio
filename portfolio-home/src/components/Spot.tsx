import type { ReactNode } from 'react'

interface Props {
  as?: 'li' | 'div' | 'article'
  className?: string
  children: ReactNode
}

/** A card whose border and surface light up where the pointer is. */
export default function Spot({ as: Tag = 'div', className = '', children }: Props) {
  const move = (e: React.PointerEvent<HTMLElement>) => {
    const el = e.currentTarget
    const r = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${e.clientX - r.left}px`)
    el.style.setProperty('--my', `${e.clientY - r.top}px`)
  }
  return (
    <Tag className={`spot ${className}`} onPointerMove={move}>
      {children}
    </Tag>
  )
}
