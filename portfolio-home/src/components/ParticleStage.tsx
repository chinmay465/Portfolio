import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

export type Anchor = 'center' | 'right' | 'right-top'

export interface Scene {
  word: string
  color: string
  anchor: Anchor
}

export interface StageHandle {
  burst: (x: number, y: number) => void
}

interface Props {
  /** What the particles should spell, or null to let them drift as a starfield. */
  scene: Scene | null
  reduced: boolean
}

interface P {
  x: number
  y: number
  vx: number
  vy: number
  tx: number
  ty: number
  z: number
  free: boolean
  seed: number
}

const FONT = '"Anek Devanagari Variable", "Anek Latin Variable", sans-serif'
const FAST = '#fff6ec'
const DUST = 'rgba(246, 239, 230, 0.5)'
const MOBILE = 900

interface Box {
  x: number
  y: number
  w: number
  h: number
}

function boxFor(anchor: Anchor, w: number, h: number): Box {
  if (w < MOBILE) return { x: w * 0.04, y: h * 0.07, w: w * 0.92, h: h * 0.3 }
  switch (anchor) {
    case 'center':
      return { x: w * 0.08, y: h * 0.09, w: w * 0.84, h: h * 0.46 }
    case 'right':
      return { x: w * 0.52, y: h * 0.18, w: w * 0.44, h: h * 0.6 }
    case 'right-top':
      return { x: w * 0.5, y: h * 0.07, w: w * 0.46, h: h * 0.4 }
  }
}

/** Rasterises a word into a box and returns points on its filled pixels, in viewport coordinates. */
function sample(word: string, box: Box, max: number): [number, number][] {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.floor(box.w))
  c.height = Math.max(1, Math.floor(box.h))
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) return []
  let size = box.h * 0.72
  ctx.font = `700 ${size}px ${FONT}`
  const m = ctx.measureText(word).width
  if (m > box.w * 0.94) size *= (box.w * 0.94) / m
  ctx.font = `700 ${size}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#fff'
  ctx.fillText(word, box.w / 2, box.h / 2 + size * 0.2)
  const data = ctx.getImageData(0, 0, c.width, c.height).data
  let gap = 3
  let pts: [number, number][] = []
  for (;;) {
    pts = []
    for (let y = 0; y < c.height; y += gap) {
      for (let x = 0; x < c.width; x += gap) {
        if (data[(y * c.width + x) * 4 + 3] > 140) pts.push([box.x + x, box.y + y])
      }
    }
    if (pts.length <= max || gap > 14) break
    gap++
  }
  return pts
}

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * One particle system behind the whole page. Each chapter hands it a Devanagari word;
 * the particles fly across and re-form it, drift with the pointer for depth, and get
 * pushed by the speed of the scroll.
 */
const ParticleStage = forwardRef<StageHandle, Props>(function ParticleStage({ scene, reduced }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const st = useRef({
    ps: [] as P[],
    w: 0,
    h: 0,
    size: 2,
    mx: -9999,
    my: -9999,
    px: 0,
    py: 0,
    scene,
    lastScroll: 0,
    raf: 0,
  })

  useImperativeHandle(ref, () => ({
    burst(x, y) {
      if (reduced) return
      for (const p of st.current.ps) {
        const dx = p.x - x
        const dy = p.y - y
        const d = Math.sqrt(dx * dx + dy * dy) || 1
        const f = Math.max(0, 26 - d * 0.045)
        p.vx += (dx / d) * f * (0.6 + Math.random() * 0.8)
        p.vy += (dy / d) * f * (0.6 + Math.random() * 0.8)
      }
    },
  }))

  function retarget() {
    const s = st.current
    if (!s.w) return
    const max = s.w < MOBILE ? 1500 : 2600
    const pts = s.scene ? shuffle(sample(s.scene.word, boxFor(s.scene.anchor, s.w, s.h), max)) : []
    const total = max + 500
    while (s.ps.length < total) {
      s.ps.push({
        x: Math.random() * s.w,
        y: Math.random() * s.h,
        vx: 0,
        vy: 0,
        tx: 0,
        ty: 0,
        z: Math.random() * 2 - 1,
        free: true,
        seed: Math.random() * 1000,
      })
    }
    s.size = s.w < MOBILE ? 1.6 : 2.1
    s.ps.forEach((p, i) => {
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
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const s = st.current
    const color = s.scene?.color ?? '#ff7a1a'
    // Away from the hero on a phone the particles sit behind text, so keep them quiet.
    const quiet = s.w < MOBILE && s.scene !== null && scrollY > s.h * 0.6
    ctx.clearRect(0, 0, s.w, s.h)
    ctx.globalCompositeOperation = 'lighter'

    const scrollNow = scrollY
    const wind = reduced ? 0 : Math.max(-40, Math.min(40, scrollNow - s.lastScroll))
    s.lastScroll = scrollNow
    s.px += ((s.mx < 0 ? 0 : s.mx / s.w - 0.5) - s.px) * 0.05
    s.py += ((s.my < 0 ? 0 : s.my / s.h - 0.5) - s.py) * 0.05

    const near = new Path2D()
    const mid = new Path2D()
    const far = new Path2D()
    const moving = new Path2D()
    const fast = new Path2D()
    const dust = new Path2D()
    const sz = s.size

    for (const p of s.ps) {
      if (!reduced) {
        const wob = p.free ? 26 : 0.8
        const tx = p.tx + Math.sin(t * 0.0009 + p.seed) * wob
        const ty = p.ty + Math.cos(t * 0.0008 + p.seed) * wob
        const k = p.free ? 0.0012 : 0.013
        p.vx += (tx - p.x) * k
        p.vy += (ty - p.y) * k - wind * 0.035 * (0.6 + p.z * 0.4)
        const dx = p.x - s.mx
        const dy = p.y - s.my
        const d2 = dx * dx + dy * dy
        if (d2 < 11000 && d2 > 0.01) {
          const d = Math.sqrt(d2)
          const f = (1 - d / 105) * 2.4
          p.vx += (dx / d) * f
          p.vy += (dy / d) * f
        }
        p.vx *= 0.87
        p.vy *= 0.87
        p.x += p.vx
        p.y += p.vy
      }
      // Pointer parallax: near particles shift more than far ones.
      const ox = s.px * p.z * 22
      const oy = s.py * p.z * 16
      const x = p.x + ox
      const y = p.y + oy
      const speed = Math.abs(p.vx) + Math.abs(p.vy)
      if (p.free) dust.rect(x, y, sz * (0.7 + p.z * 0.3), sz * (0.7 + p.z * 0.3))
      else if (speed > 4) fast.rect(x, y, sz * 0.8, sz * 0.8)
      else if (speed > 1) moving.rect(x, y, sz, sz)
      else if (p.z > 0.33) near.rect(x, y, sz * 1.25, sz * 1.25)
      else if (p.z > -0.33) mid.rect(x, y, sz, sz)
      else far.rect(x, y, sz * 0.8, sz * 0.8)
    }

    const a = quiet ? 0.35 : 1
    const layers: [Path2D, string, number][] = [
      [dust, DUST, (s.scene ? 0.45 : 0.8) * a],
      [far, color, 0.5 * a],
      [mid, color, 0.78 * a],
      [near, color, a],
      [moving, color, 0.9 * a],
      [fast, FAST, 0.9 * a],
    ]
    for (const [path, fill, alpha] of layers) {
      ctx.globalAlpha = alpha
      ctx.fillStyle = fill
      ctx.fill(path)
    }
    ctx.globalAlpha = 1
  }

  useEffect(() => {
    st.current.scene = scene
    retarget()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const s = st.current
    let cancelled = false
    const resize = () => {
      const dpr = Math.min(1.75, window.devicePixelRatio || 1)
      s.w = innerWidth
      s.h = innerHeight
      canvas.width = Math.floor(s.w * dpr)
      canvas.height = Math.floor(s.h * dpr)
      canvas.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0)
      retarget()
    }
    const words = 'चिन्मय नमस्कार २०१८ एकत्र अंक शोध सेतु कवच पुन्हा भेटू आज'
    const ready = document.fonts
      ? Promise.all([document.fonts.load(`700 120px "Anek Devanagari Variable"`, words), document.fonts.ready])
      : Promise.resolve()
    ready
      .catch(() => undefined)
      .then(() => {
        if (cancelled) return
        resize()
        addEventListener('resize', resize)
      })

    const move = (e: PointerEvent) => {
      s.mx = e.clientX
      s.my = e.clientY
    }
    const leave = () => {
      s.mx = -9999
      s.my = -9999
    }
    addEventListener('pointermove', move, { passive: true })
    document.addEventListener('pointerleave', leave)

    s.lastScroll = scrollY
    const loop = (t: number) => {
      if (!document.hidden) draw(t)
      s.raf = requestAnimationFrame(loop)
    }
    if (!reduced) s.raf = requestAnimationFrame(loop)
    return () => {
      cancelled = true
      cancelAnimationFrame(s.raf)
      removeEventListener('resize', resize)
      removeEventListener('pointermove', move)
      document.removeEventListener('pointerleave', leave)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced])

  return <canvas ref={canvasRef} className="stage" aria-hidden="true" />
})

export default ParticleStage
