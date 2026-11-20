import { useCallback, useEffect, useRef, useState } from 'react'
import { scrambleFrame } from '../lib/scramble'

interface Props {
  text: string
  reduced: boolean
  duration?: number
  delay?: number
  className?: string
}

/** Decodes from Devanagari and Latin noise into the real text; hover to run it again. */
export default function ScrambleText({ text, reduced, duration = 1200, delay = 0, className }: Props) {
  const [shown, setShown] = useState(reduced ? text : scrambleFrame(text, 0))
  const raf = useRef(0)

  const run = useCallback(
    (wait: number) => {
      if (reduced) return
      cancelAnimationFrame(raf.current)
      let start = 0
      const tick = (t: number) => {
        if (!start) start = t + wait
        const p = (t - start) / duration
        if (p < 0) {
          raf.current = requestAnimationFrame(tick)
          return
        }
        // Change glyphs every other frame so the noise reads as flicker, not blur.
        if (Math.floor(t / 34) % 2 === 0 || p >= 1) setShown(scrambleFrame(text, p))
        if (p < 1) raf.current = requestAnimationFrame(tick)
      }
      raf.current = requestAnimationFrame(tick)
    },
    [text, reduced, duration],
  )

  useEffect(() => {
    run(delay)
    return () => cancelAnimationFrame(raf.current)
  }, [run, delay])

  return (
    <span className={className} aria-label={text} onPointerEnter={() => run(0)}>
      <span aria-hidden="true">{reduced ? text : shown}</span>
    </span>
  )
}
