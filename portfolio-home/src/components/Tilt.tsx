import { useRef, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  reduced: boolean
  className?: string
}

/** Tilts toward the pointer in 3D with a glare that follows it. */
export default function Tilt({ children, reduced, className = '' }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const move = (e: React.PointerEvent) => {
    const el = ref.current
    if (!el || reduced || e.pointerType !== 'mouse') return
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top) / r.height
    el.style.setProperty('--rx', `${(0.5 - y) * 9}deg`)
    el.style.setProperty('--ry', `${(x - 0.5) * 12}deg`)
    el.style.setProperty('--gx', `${x * 100}%`)
    el.style.setProperty('--gy', `${y * 100}%`)
    el.dataset.hover = 'true'
  }
  const leave = () => {
    const el = ref.current
    if (!el) return
    el.style.setProperty('--rx', '0deg')
    el.style.setProperty('--ry', '0deg')
    delete el.dataset.hover
  }
  return (
    <div className={`tilt ${className}`} onPointerMove={move} onPointerLeave={leave}>
      <div ref={ref} className="tilt-inner">
        {children}
        <span className="tilt-glare" aria-hidden="true" />
      </div>
    </div>
  )
}
