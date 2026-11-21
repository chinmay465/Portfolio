import { useEffect, useRef } from 'react'

interface Props {
  word: string
  accent: string
  reduced: boolean
  label: string
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  tx: number
  ty: number
  free: boolean
  seed: number
}

const FONT = '"Anek Devanagari Variable", "Anek Latin Variable", sans-serif'
const LATIN = '"Unbounded Variable", "Anek Latin Variable", sans-serif'
/** Space at the bottom of the field kept clear for the caption and skill chips. */
const RESERVED = 96
const MAX_POINTS = 3400
const CALM = '#ffe9d6'
const FAST = '#6ff3ff'

/** Rasterises a word off-screen and returns points on its filled pixels. */
function sampleWord(word: string, w: number, h: number): { pts: [number, number][]; gap: number } {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.floor(w))
  c.height = Math.max(1, Math.floor(h))
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) return { pts: [], gap: 4 }
  // Devanagari hangs from a headline near the top; Latin sits on a baseline. Each
  // needs its own size and vertical offset to look centred above the skill dock.
  const deva = /[\u0900-\u097F]/.test(word)
  const font = deva ? `700 SIZEpx ${FONT}` : `900 SIZEpx ${LATIN}`
  const area = h - RESERVED
  let size = deva ? area * 0.72 : area * 0.58
  ctx.font = font.replace('SIZE', String(size))
  const measured = ctx.measureText(word).width
  if (measured > w * 0.84) size *= (w * 0.84) / measured
  ctx.font = font.replace('SIZE', String(size))
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#fff'
  ctx.fillText(word, w / 2, deva ? area / 2 + size * 0.22 : area / 2 + size * 0.04)
  const data = ctx.getImageData(0, 0, c.width, c.height).data
  let gap = 3
  let pts: [number, number][] = []
  for (;;) {
    pts = []
    for (let y = 0; y < c.height; y += gap) {
      for (let x = 0; x < c.width; x += gap) {
        if (data[(y * c.width + x) * 4 + 3] > 140) pts.push([x, y])
      }
    }
    if (pts.length <= MAX_POINTS || gap > 12) break
    gap++
  }
  return { pts, gap }
}

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * The hero picture: a few thousand particles that assemble into a Devanagari word,
 * scatter away from the pointer, burst on click and fly across to the next word.
 */
export default function GlyphField({ word, accent, reduced, label }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const state = useRef({
    particles: [] as Particle[],
    w: 0,
    h: 0,
    gap: 4,
    mx: -9999,
    my: -9999,
    accent,
    word,
    visible: true,
    raf: 0,
  })

  // Retarget whenever the word changes.
  useEffect(() => {
    const s = state.current
    s.word = word
    s.accent = accent
    retarget()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word, accent])

  function retarget() {
    const s = state.current
    if (!s.w || !s.h) return
    const { pts, gap } = sampleWord(s.word, s.w, s.h)
    s.gap = gap
    shuffle(pts)
    const need = Math.max(pts.length + 220, s.particles.length)
    while (s.particles.length < need) {
      const fromLeft = Math.random() < 0.5
      s.particles.push({
        x: fromLeft ? -20 : s.w + 20,
        y: Math.random() * s.h,
        vx: 0,
        vy: 0,
        tx: 0,
        ty: 0,
        free: true,
        seed: Math.random() * 1000,
      })
    }
    s.particles.forEach((p, i) => {
      if (i < pts.length) {
        p.tx = pts[i][0]
        p.ty = pts[i][1]
        p.free = false
      } else {
        p.tx = Math.random() * s.w
        p.ty = Math.random() * s.h
        p.free = true
      }
      if (reduced) {
        p.x = p.tx
        p.y = p.ty
      }
    })
    if (reduced) draw(0)
  }

  function draw(t: number) {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const s = state.current
    ctx.clearRect(0, 0, s.w, s.h)
    ctx.globalCompositeOperation = 'lighter'
    const size = Math.max(1.8, s.gap * 0.72)
    const buckets: [string, Path2D][] = [
      [s.accent, new Path2D()],
      [CALM, new Path2D()],
      [FAST, new Path2D()],
      ['rgba(255,233,214,0.22)', new Path2D()],
    ]
    for (const p of s.particles) {
      if (!reduced) {
        const wob = p.free ? 18 : 0.7
        const tx = p.tx + Math.sin(t * 0.0012 + p.seed) * wob
        const ty = p.ty + Math.cos(t * 0.001 + p.seed) * wob
        p.vx += (tx - p.x) * (p.free ? 0.0016 : 0.02)
        p.vy += (ty - p.y) * (p.free ? 0.0016 : 0.02)
        const dx = p.x - s.mx
        const dy = p.y - s.my
        const d2 = dx * dx + dy * dy
        const R = 96
        if (d2 < R * R && d2 > 0.01) {
          const d = Math.sqrt(d2)
          const f = (1 - d / R) * 2.6
          p.vx += (dx / d) * f
          p.vy += (dy / d) * f
        }
        p.vx *= 0.86
        p.vy *= 0.86
        p.x += p.vx
        p.y += p.vy
      }
      const speed = Math.abs(p.vx) + Math.abs(p.vy)
      const bucket = p.free ? 3 : speed > 4 ? 2 : speed > 1.8 ? 1 : 0
      const sz = bucket === 2 ? size * 0.8 : size
      buckets[bucket][1].rect(p.x, p.y, sz, sz)
    }
    for (const [color, path] of buckets) {
      ctx.fillStyle = color
      ctx.fill(path)
    }
  }

  // Size, pointer and the animation loop.
  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const s = state.current
    let cancelled = false

    const resize = () => {
      const r = wrap.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      s.w = r.width
      s.h = r.height
      canvas.width = Math.floor(r.width * dpr)
      canvas.height = Math.floor(r.height * dpr)
      canvas.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0)
      retarget()
    }
    const ro = new ResizeObserver(resize)
    // Wait for the Devanagari face, or the first word samples a fallback font.
    const fontsReady = document.fonts
      ? Promise.all([document.fonts.load(`700 120px "Anek Devanagari Variable"`, 'एकत्र अंक शोध सेतु कवच'),
          document.fonts.load(`800 120px "Unbounded Variable"`, 'ReactAITypeScriptNext.jsDesignMFE70→95KYCTests'),
          document.fonts.ready,])
      : Promise.resolve()
    fontsReady
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) ro.observe(wrap)
      })

    const local = (e: PointerEvent) => {
      const r = wrap.getBoundingClientRect()
      return [e.clientX - r.left, e.clientY - r.top] as const
    }
    const move = (e: PointerEvent) => {
      ;[s.mx, s.my] = local(e)
    }
    const leave = () => {
      s.mx = -9999
      s.my = -9999
    }
    const burst = (e: PointerEvent) => {
      if (reduced) return
      const [cx, cy] = local(e)
      for (const p of s.particles) {
        const dx = p.x - cx
        const dy = p.y - cy
        const d = Math.sqrt(dx * dx + dy * dy) || 1
        const f = Math.max(0, 22 - d * 0.05)
        p.vx += (dx / d) * f * (0.6 + Math.random() * 0.8)
        p.vy += (dy / d) * f * (0.6 + Math.random() * 0.8)
      }
    }
    wrap.addEventListener('pointermove', move)
    wrap.addEventListener('pointerleave', leave)
    wrap.addEventListener('pointerdown', burst)

    const io = new IntersectionObserver(([entry]) => {
      s.visible = entry.isIntersecting
    })
    io.observe(wrap)

    const loop = (t: number) => {
      if (s.visible && !document.hidden) draw(t)
      s.raf = requestAnimationFrame(loop)
    }
    if (!reduced) s.raf = requestAnimationFrame(loop)

    return () => {
      cancelled = true
      cancelAnimationFrame(s.raf)
      ro.disconnect()
      io.disconnect()
      wrap.removeEventListener('pointermove', move)
      wrap.removeEventListener('pointerleave', leave)
      wrap.removeEventListener('pointerdown', burst)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced])

  return (
    <div ref={wrapRef} className="glyph-field" role="img" aria-label={label}>
      <canvas ref={canvasRef} />
    </div>
  )
}
