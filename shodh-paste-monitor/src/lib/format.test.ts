import { describe, expect, it } from 'vitest'
import { formatElapsed, splitHighlights } from './format.ts'

describe('formatElapsed', () => {
  it('formats sub-minute, minute and hour spans', () => {
    expect(formatElapsed(0)).toBe('00:00:00')
    expect(formatElapsed(5_000)).toBe('00:00:05')
    expect(formatElapsed(65_000)).toBe('00:01:05')
    expect(formatElapsed(3_661_000)).toBe('01:01:01')
  })

  it('never goes negative', () => {
    expect(formatElapsed(-1000)).toBe('00:00:00')
  })
})

describe('splitHighlights', () => {
  it('marks matched terms, case-insensitively', () => {
    const segs = splitHighlights('an Acme billing note', ['acme', 'billing'])
    expect(segs.filter((s) => s.hit).map((s) => s.text)).toEqual(['Acme', 'billing'])
  })

  it('returns the whole string unmarked when there are no keywords', () => {
    expect(splitHighlights('hello', [])).toEqual([{ text: 'hello', hit: false }])
  })
})
