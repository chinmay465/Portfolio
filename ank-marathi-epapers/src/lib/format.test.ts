import { describe, expect, it } from 'vitest'
import { dayKey, formatDate, matchesQuery, toDevanagari } from './format'

describe('toDevanagari', () => {
  it('converts every digit', () => {
    expect(toDevanagari(2026)).toBe('२०२६')
    expect(toDevanagari('17/11')).toBe('१७/११')
  })
})

describe('formatDate', () => {
  const d = new Date(2026, 10, 17)
  it('formats Marathi with Devanagari numerals', () => {
    expect(formatDate(d, 'mr')).toEqual({ weekday: 'मंगळवार', date: '१७ नोव्हेंबर २०२६' })
  })
  it('formats English', () => {
    expect(formatDate(d, 'en')).toEqual({ weekday: 'Tuesday', date: '17 November 2026' })
  })
})

describe('dayKey', () => {
  it('pads month and day', () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('matchesQuery', () => {
  it('matches either script and ignores spaces and case', () => {
    expect(matchesQuery(['महाराष्ट्र टाइम्स', 'Maharashtra Times'], 'maharashtratimes')).toBe(true)
    expect(matchesQuery(['सकाळ', 'Sakal'], 'सका')).toBe(true)
    expect(matchesQuery(['सकाळ', 'Sakal'], 'lok')).toBe(false)
  })
  it('matches everything on an empty query', () => {
    expect(matchesQuery(['x'], '  ')).toBe(true)
  })
})
