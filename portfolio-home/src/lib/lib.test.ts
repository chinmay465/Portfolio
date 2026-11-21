import { describe, expect, it } from 'vitest'
import { classify, BLOCKED_UNDER_MS } from './ping'
import { scrambleFrame, SCRAMBLE_GLYPHS } from './scramble'
import { marathiDate, toDevanagariDigits } from './format'
import { projects, webProjects } from '../data/projects'

describe('scrambleFrame', () => {
  it('returns the target once fully revealed', () => {
    expect(scrambleFrame('Chinmay Upare', 1)).toBe('Chinmay Upare')
  })
  it('keeps length and spaces while scrambling', () => {
    const f = scrambleFrame('Chinmay Upare', 0, () => 0)
    expect(f).toHaveLength(13)
    expect(f[7]).toBe(' ')
    expect(f[0]).toBe(SCRAMBLE_GLYPHS[0])
  })
  it('settles characters left to right', () => {
    expect(scrambleFrame('abcd', 0.5, () => 0).slice(0, 2)).toBe('ab')
  })
})

describe('classify', () => {
  it('treats any answer as online', () => {
    expect(classify(true, 900, false)).toEqual({ state: 'online', ms: 900 })
  })
  it('flags instant failures as blocked, not down', () => {
    expect(classify(false, BLOCKED_UNDER_MS - 1, false).state).toBe('blocked')
    expect(classify(false, 4000, false).state).toBe('unreachable')
    expect(classify(false, 10, true).state).toBe('unreachable')
  })
})

describe('format', () => {
  it('converts digits to Devanagari', () => {
    expect(toDevanagariDigits(2026)).toBe('२०२६')
  })
  it('prints a Marathi dateline', () => {
    expect(marathiDate(new Date(2026, 10, 20))).toBe('शुक्रवार, २० नोव्हेंबर')
  })
})

describe('projects', () => {
  it('links every project to its folder, and every web app to its live URL', () => {
    for (const p of projects) {
      expect(p.code).toContain('github.com/chinmay465/Portfolio/tree/main/')
      if (p.kind === 'Android app') {
        expect(p.live).toBeUndefined()
        expect(p.download).toMatch(/^https:\/\/github\.com\/chinmay465\/Portfolio\//)
      } else {
        expect(p.live).toMatch(/^https:\/\/[a-z-]+\.onrender\.com$/)
      }
    }
  })
  it('only pings projects that have a live URL', () => {
    expect(webProjects.map((p) => p.id)).toEqual(['ekatra', 'ank', 'shodh', 'setu'])
    expect(projects.map((p) => p.id)).toContain('kavach')
    expect(projects.map((p) => p.id)).toContain('swar')
  })
})

describe('profile', () => {
  it('never publishes a phone number', async () => {
    const profile = await import('../data/profile')
    expect(JSON.stringify(profile)).not.toMatch(/\+?91[\s-]?\d{5}\s?\d{5}|\b\d{10}\b/)
  })
})

describe('routes', () => {
  it('gives every project a URL-safe, unique id for /projects/:id', () => {
    const ids = projects.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/)
  })
})
