import { useEffect, useRef } from 'react'

/**
 * Page-wide effects that answer the pointer and the scroll: a soft spotlight,
 * a trailing ring that grows over anything clickable, and a reading-progress line.
 */
export default function Ambient({ reduced }: { reduced: boolean }) {
  const ring = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = document.documentElement
    let x = innerWidth / 2
    let y = innerHeight / 3
    let rx = x
    let ry = y
    let raf = 0
    let finePointer = matchMedia('(pointer: fine)').matches

    const move = (e: PointerEvent) => {
      x = e.clientX
      y = e.clientY
      finePointer = e.pointerType === 'mouse'
      const hot = e.target instanceof Element && e.target.closest('a, button, [role="img"]')
      ring.current?.toggleAttribute('data-hot', Boolean(hot))
      ring.current?.toggleAttribute('data-on', finePointer)
    }
    const leave = () => ring.current?.removeAttribute('data-on')
    const scroll = () => {
      const max = root.scrollHeight - innerHeight
      if (bar.current) bar.current.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`
    }
    const tick = () => {
      rx += (x - rx) * (reduced ? 1 : 0.18)
      ry += (y - ry) * (reduced ? 1 : 0.18)
      root.style.setProperty('--px', `${x}px`)
      root.style.setProperty('--py', `${y}px`)
      if (ring.current) ring.current.style.transform = `translate(${rx}px, ${ry}px)`
      raf = requestAnimationFrame(tick)
    }

    addEventListener('pointermove', move, { passive: true })
    document.addEventListener('pointerleave', leave)
    addEventListener('scroll', scroll, { passive: true })
    scroll()
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      removeEventListener('pointermove', move)
      document.removeEventListener('pointerleave', leave)
      removeEventListener('scroll', scroll)
    }
  }, [reduced])

  return (
    <>
      <div className="aurora" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="spotlight" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />
      <div ref={ring} className="cursor-ring" aria-hidden="true" />
      <div ref={bar} className="progress" aria-hidden="true" />
    </>
  )
}
