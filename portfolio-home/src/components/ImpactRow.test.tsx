// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Impact } from '../data/profile'
import { pendingFrames, runFrame, scrollIntoView, stubBrowser } from '../test/dom'
import ImpactRow from './ImpactRow'

stubBrowser()

const lighthouse: Impact = {
  what: 'Lighthouse score',
  before: '70',
  after: '95',
  count: { from: 70, to: 95 },
  where: 'Paytm Money',
  how: 'Code splitting.',
}

const requests: Impact = { ...lighthouse, what: 'Support requests', before: '100%', after: '30%', count: { from: 100, to: 30, suffix: '%' } }

const onboarding: Impact = { what: 'Company onboarding', before: '2 days', after: '2 hours', where: 'KredX', how: 'Lookups.' }

/** What the eye sees: the decoding text once it runs, not the screen-reader copy. */
const shown = (c: HTMLElement) => {
  const live = c.querySelector('.impact-after .impact-live')!
  return (live.querySelector('[aria-hidden="true"]') ?? live).textContent
}

describe('ImpactRow', () => {
  it('counts from the old value up to the new one once it scrolls into view', () => {
    const { container } = render(<ImpactRow item={lighthouse} reduced={false} />)
    scrollIntoView()
    expect(shown(container)).toBe('70')

    // The first frame sets the clock; the count starts 450 ms later and lasts 1100 ms.
    runFrame(1000)
    expect(shown(container)).toBe('70')
    const seen = [70]
    for (let t = 1450; t <= 2550; t += 110) {
      runFrame(t)
      seen.push(Number(shown(container)))
    }
    expect(seen.at(-1)).toBe(95)
    expect(seen.some((n) => n > 70 && n < 95)).toBe(true)
    expect(seen).toEqual([...seen].sort((a, b) => a - b))
    expect(pendingFrames()).toBe(0)
  })

  it('counts down with the suffix when the new value is smaller', () => {
    const { container } = render(<ImpactRow item={requests} reduced={false} />)
    scrollIntoView()
    expect(shown(container)).toBe('100%')
    runFrame(0)
    runFrame(1000)
    expect(Number.parseInt(shown(container)!)).toBeLessThan(100)
    runFrame(1550)
    expect(shown(container)).toBe('30%')
  })

  it('shows the final value straight away with reduced motion', () => {
    const { container } = render(<ImpactRow item={lighthouse} reduced />)
    expect(shown(container)).toBe('95')
    scrollIntoView()
    expect(shown(container)).toBe('95')
    expect(pendingFrames()).toBe(0)
    expect(container.querySelector('.impact-row')!.getAttribute('data-seen')).toBe('true')
  })

  it('shows text results in full with reduced motion', () => {
    const { container } = render(<ImpactRow item={onboarding} reduced />)
    scrollIntoView()
    expect(shown(container)).toBe('2 hours')
    expect(pendingFrames()).toBe(0)
  })

  it('reads the change as one phrase to screen readers', () => {
    const { container, getByText } = render(<ImpactRow item={lighthouse} reduced={false} />)
    expect(getByText('70 to 95').className).toBe('sr-only')
    // Every other part of the values is hidden, so the phrase is read once.
    const values = container.querySelector('.impact-values')!
    for (const el of values.children) if (el.className !== 'sr-only') expect(el.getAttribute('aria-hidden')).toBe('true')
  })

  it('sizes the value by its final text while it counts or decodes, so the row never re-wraps', () => {
    const room = (c: HTMLElement) => c.querySelector('.impact-after .impact-room')!.textContent
    const counting = render(<ImpactRow item={requests} reduced={false} />)
    scrollIntoView()
    runFrame(1000)
    runFrame(1500)
    expect(shown(counting.container)).not.toBe('30%')
    expect(room(counting.container)).toBe('30%')
    counting.unmount()
    const decoding = render(<ImpactRow item={onboarding} reduced={false} />)
    scrollIntoView()
    expect(room(decoding.container)).toBe('2 hours')
  })

  it('stops counting when it unmounts mid-count', () => {
    const { unmount } = render(<ImpactRow item={lighthouse} reduced={false} />)
    scrollIntoView()
    runFrame(0)
    expect(pendingFrames()).toBe(1)
    unmount()
    expect(pendingFrames()).toBe(0)
  })
})
