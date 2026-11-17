import { describe, expect, it } from 'vitest'
import { PAPERS } from '../data/papers'
import { parseIssueDate, resolveLink } from './links'

const paper = (id: string) => PAPERS.find((p) => p.id === id)!
const date = { y: 2026, m: 11, d: 7 }

describe('resolveLink', () => {
  it('builds Sakal city + date links', () => {
    expect(resolveLink(paper('sakal'), 'pune', date)).toEqual({
      href: 'https://epaper.esakal.com/smartepaper/ui/home.aspx?q=Pune/Main/2026-11-07',
      kind: 'dated',
    })
    expect(resolveLink(paper('sakal'), 'ahilyanagar', date).href).toContain('q=Nagar/Main/')
  })

  it('builds Lokmat links with the encoded edition name', () => {
    expect(resolveLink(paper('lokmat'), 'pune', date).href).toBe(
      'https://epaper.lokmat.com/main-editions/Pune%20Main/2026-11-07/1',
    )
  })

  it('builds Pudhari links from name and code', () => {
    expect(resolveLink(paper('pudhari'), 'thane', date).href).toBe(
      'https://epaper.pudhari.news/edition/Thane/PUDHARI_THE/PUDHARI_THE_20261107/page/1',
    )
  })

  it('marks Tarun Bharat links as latest-issue only', () => {
    expect(resolveLink(paper('tarun-bharat'), 'kolhapur', date)).toEqual({
      href: 'https://epaper.tarunbharat.com/t/31522',
      kind: 'latest',
    })
  })

  it('opens Loksatta cities on their fixed latest-issue pages', () => {
    expect(resolveLink(paper('loksatta'), 'pune', date)).toEqual({
      href: 'https://epaper.loksatta.com/t/643/latest/Pune',
      kind: 'latest',
    })
    expect(resolveLink(paper('loksatta'), 'sambhajinagar', date).href).toBe(
      'https://epaper.loksatta.com/t/28138/latest/Chhatrapati-Sambhajinagar',
    )
  })

  it('falls back to the home page without a city or a known edition', () => {
    expect(resolveLink(paper('sakal'), null, date)).toEqual({ href: 'https://epaper.esakal.com/', kind: 'home' })
    expect(resolveLink(paper('pudhari'), 'satara', date).kind).toBe('home')
    expect(resolveLink(paper('maharashtra-times'), 'pune', date).kind).toBe('home')
  })

  it('only lists editions for cities the paper publishes in', () => {
    for (const p of PAPERS) {
      for (const city of Object.keys(p.editions ?? {})) {
        expect(p.cities, `${p.id} → ${city}`).toContain(city)
      }
    }
  })
})

describe('parseIssueDate', () => {
  it('accepts valid dates and rejects the rest', () => {
    expect(parseIssueDate('2026-11-17')).toEqual({ y: 2026, m: 11, d: 17 })
    expect(parseIssueDate('2026-02-30')).toBeNull()
    expect(parseIssueDate('')).toBeNull()
  })
})
