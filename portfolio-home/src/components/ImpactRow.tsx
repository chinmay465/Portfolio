import { useEffect, useRef, useState } from 'react'
import type { Impact } from '../data/profile'
import { useRevealed } from '../hooks/motion'
import ScrambleText from './ScrambleText'

/** One before → after line: the old value gets struck out, the new one counts or decodes in. */
export default function ImpactRow({ item, reduced }: { item: Impact; reduced: boolean }) {
  const ref = useRef<HTMLLIElement>(null)
  const seen = useRevealed(ref)
  const [n, setN] = useState(item.count?.from ?? 0)

  useEffect(() => {
    if (!seen || !item.count || reduced) return
    const { from, to } = item.count
    let raf = 0
    let start = 0
    const tick = (t: number) => {
      if (!start) start = t + 450
      const p = Math.min(1, Math.max(0, (t - start) / 1100))
      const eased = 1 - (1 - p) ** 3
      setN(Math.round(from + (to - from) * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [seen, item.count, reduced])

  const after = item.count
    ? `${reduced || !seen ? item.count.to : n}${item.count.suffix ?? ''}`
    : null

  return (
    <li ref={ref} className="impact-row" data-seen={seen || reduced}>
      <div className="impact-what">
        <h3>{item.what}</h3>
        <span className="impact-where">{item.where}</span>
      </div>
      <div className="impact-values" aria-label={`${item.before} to ${item.after}`}>
        <s className="impact-before" aria-hidden="true">
          {item.before}
        </s>
        <span className="impact-arrow" aria-hidden="true" />
        <strong className="impact-after" aria-hidden="true">
          {after ?? (seen ? <ScrambleText text={item.after} reduced={reduced} delay={450} duration={900} /> : item.after)}
        </strong>
      </div>
      <p className="impact-how">{item.how}</p>
    </li>
  )
}
