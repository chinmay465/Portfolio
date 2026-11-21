import { useEffect, useRef } from 'react'

/** A thin line under the nav that fills as you read down the page. */
export default function ScrollProgress() {
  const bar = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = document.documentElement
    const update = () => {
      const max = root.scrollHeight - innerHeight
      if (bar.current) bar.current.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`
    }
    addEventListener('scroll', update, { passive: true })
    addEventListener('resize', update)
    update()
    return () => {
      removeEventListener('scroll', update)
      removeEventListener('resize', update)
    }
  }, [])
  return <div ref={bar} className="progress" aria-hidden="true" />
}
