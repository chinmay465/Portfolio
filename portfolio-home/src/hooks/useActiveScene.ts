import { useEffect, useState } from 'react'

/**
 * Returns the data-scene id of whichever section is crossing the middle of the
 * viewport. Sections opt in with a data-scene attribute.
 */
export function useActiveScene(initial: string): string {
  const [active, setActive] = useState(initial)
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive((e.target as HTMLElement).dataset.scene ?? initial)
        }
      },
      { rootMargin: '-50% 0px -50% 0px' },
    )
    document.querySelectorAll<HTMLElement>('[data-scene]').forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [initial])
  return active
}
