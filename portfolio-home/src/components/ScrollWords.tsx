import { useEffect, useRef, useState } from 'react'

interface Props {
  text: string
  reduced: boolean
  className?: string
}

/** Words light up one by one as the paragraph moves up through the viewport. */
export default function ScrollWords({ text, reduced, className = '' }: Props) {
  const ref = useRef<HTMLParagraphElement>(null)
  const words = text.split(' ')
  const [lit, setLit] = useState(reduced ? words.length : 0)

  useEffect(() => {
    if (reduced) return
    const update = () => {
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      // 0 when the top reaches 85% of the viewport, 1 when the bottom reaches 45%.
      const start = innerHeight * 0.85
      const end = innerHeight * 0.45
      const p = (start - r.top) / (start - end + r.height)
      setLit(Math.round(Math.min(1, Math.max(0, p)) * words.length))
    }
    addEventListener('scroll', update, { passive: true })
    update()
    return () => removeEventListener('scroll', update)
  }, [reduced, words.length])

  return (
    <p ref={ref} className={`scroll-words ${className}`}>
      <span className="sr-only">{text}</span>
      {words.map((w, i) => (
        <span key={i} aria-hidden="true" className={i < lit ? 'lit' : undefined}>
          {w}{' '}
        </span>
      ))}
    </p>
  )
}
