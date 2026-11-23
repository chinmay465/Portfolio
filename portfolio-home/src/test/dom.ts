import { act, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

/**
 * Browser APIs that jsdom lacks or can't drive, replaced with stubs a test controls:
 * scroll-into-view (IntersectionObserver), animation frames, resize observers and media queries (none match).
 * Call `stubBrowser()` at the top of a component test file that runs under jsdom.
 */

type IOCallback = (entries: Pick<IntersectionObserverEntry, 'isIntersecting' | 'target'>[]) => void

const observers = new Set<{ cb: IOCallback; els: Set<Element> }>()
let frames = new Map<number, FrameRequestCallback>()
let nextFrame = 1

class FakeIntersectionObserver {
  private entry: { cb: IOCallback; els: Set<Element> }
  constructor(cb: IOCallback) {
    this.entry = { cb, els: new Set() }
    observers.add(this.entry)
  }
  observe(el: Element) {
    this.entry.els.add(el)
  }
  unobserve(el: Element) {
    this.entry.els.delete(el)
  }
  disconnect() {
    observers.delete(this.entry)
  }
  takeRecords() {
    return []
  }
}

class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

/** Scrolls every observed element (or just `el`) into view. */
export function scrollIntoView(el?: Element) {
  act(() => {
    for (const o of [...observers]) {
      const targets = [...o.els].filter((t) => !el || t === el)
      if (targets.length) o.cb(targets.map((target) => ({ isIntersecting: true, target })))
    }
  })
}

/** Runs the animation frames queued so far at time `t` (ms), as the browser would. */
export function runFrame(t: number) {
  const due = frames
  frames = new Map()
  act(() => {
    for (const cb of due.values()) cb(t)
  })
}

export const pendingFrames = () => frames.size

export function stubBrowser() {
  beforeEach(() => {
    observers.clear()
    frames = new Map()
    nextFrame = 1
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      const id = nextFrame++
      frames.set(id, cb)
      return id
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }))
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })
}
