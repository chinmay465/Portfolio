import { describe, expect, it } from 'vitest'
import { PAPERS } from '../data/papers'
import { dayKey, formatDate, formatShortDate, matchesQuery, num, toDevanagari } from './format'

describe('toDevanagari', () => {
  it('converts every digit', () => {
    expect(toDevanagari(2026)).toBe('२०२६')
    expect(toDevanagari('17/11')).toBe('१७/११')
  })
  it('maps each of 0–9 to its Devanagari numeral', () => {
    expect(toDevanagari('0123456789')).toBe('०१२३४५६७८९')
  })
  it('leaves non-digits, including Devanagari text, untouched', () => {
    expect(toDevanagari('सकाळ 1932')).toBe('सकाळ १९३२')
    expect(toDevanagari('Pune')).toBe('Pune')
    expect(toDevanagari('')).toBe('')
  })
})

describe('num', () => {
  it('uses Devanagari numerals in Marathi and Latin digits in English', () => {
    expect(num(7, 'mr')).toBe('७')
    expect(num(1881, 'mr')).toBe('१८८१')
    expect(num(1881, 'en')).toBe('1881')
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

  it('names every Marathi month', () => {
    const months = Array.from({ length: 12 }, (_, m) => formatDate(new Date(2026, m, 1), 'mr').date)
    expect(months).toEqual([
      '१ जानेवारी २०२६',
      '१ फेब्रुवारी २०२६',
      '१ मार्च २०२६',
      '१ एप्रिल २०२६',
      '१ मे २०२६',
      '१ जून २०२६',
      '१ जुलै २०२६',
      '१ ऑगस्ट २०२६',
      '१ सप्टेंबर २०२६',
      '१ ऑक्टोबर २०२६',
      '१ नोव्हेंबर २०२६',
      '१ डिसेंबर २०२६',
    ])
  })

  it('names every Marathi weekday', () => {
    // 15–21 November 2026 runs Sunday to Saturday.
    const days = Array.from({ length: 7 }, (_, i) => formatDate(new Date(2026, 10, 15 + i), 'mr').weekday)
    expect(days).toEqual(['रविवार', 'सोमवार', 'मंगळवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार'])
  })

  it('names every English weekday', () => {
    const days = Array.from({ length: 7 }, (_, i) => formatDate(new Date(2026, 10, 15 + i), 'en').weekday)
    expect(days).toEqual(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'])
  })

  it('writes two-digit days and the year in Devanagari', () => {
    expect(formatDate(new Date(2027, 0, 31), 'mr')).toEqual({ weekday: 'रविवार', date: '३१ जानेवारी २०२७' })
  })
})

describe('formatShortDate', () => {
  it('formats day and month in Marathi', () => {
    expect(formatShortDate({ y: 2026, m: 11, d: 17 }, 'mr')).toBe('१७ नोव्हेंबर')
    expect(formatShortDate({ y: 2026, m: 5, d: 3 }, 'mr')).toBe('३ मे')
  })
  it('uses the short English month', () => {
    expect(formatShortDate({ y: 2026, m: 11, d: 17 }, 'en')).toBe('17 Nov')
    expect(formatShortDate({ y: 2026, m: 1, d: 9 }, 'en')).toBe('9 Jan')
    expect(formatShortDate({ y: 2026, m: 12, d: 31 }, 'en')).toBe('31 Dec')
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

describe('paper search', () => {
  // Same call App.tsx makes for the search box.
  const search = (query: string) =>
    PAPERS.filter((p) => matchesQuery([p.name.mr, p.name.en], query)).map((p) => p.id)

  it('finds every paper by its Marathi or English name', () => {
    for (const p of PAPERS) {
      expect(search(p.name.mr)).toContain(p.id)
      expect(search(p.name.en)).toContain(p.id)
    }
  })

  it('matches the same papers for a prefix typed in either script', () => {
    expect(search('लोक')).toEqual(['lokmat', 'loksatta'])
    expect(search('lok')).toEqual(['lokmat', 'loksatta'])
    expect(search('पुढा')).toEqual(['pudhari'])
    expect(search('pudh')).toEqual(['pudhari'])
  })

  it('ignores case and spaces in English names', () => {
    expect(search('SAKAL')).toEqual(['sakal'])
    expect(search('punyanagari')).toEqual(['punya-nagari'])
    expect(search('  Tarun   Bharat ')).toEqual(['tarun-bharat'])
  })

  it('ignores spaces in Devanagari names', () => {
    expect(search('तरुणभारत')).toEqual(['tarun-bharat'])
    expect(search('महाराष्ट्र टाइम्स')).toEqual(['maharashtra-times'])
    expect(search('पुण्य नगरी')).toEqual(['punya-nagari'])
  })

  it('matches inside a name, not only at the start', () => {
    expect(search('टाइम्स')).toEqual(['maharashtra-times'])
    expect(search('times')).toEqual(['maharashtra-times'])
  })

  it('returns nothing for a name no paper has', () => {
    expect(search('हिंदू')).toEqual([])
    expect(search('hindu')).toEqual([])
  })
})
