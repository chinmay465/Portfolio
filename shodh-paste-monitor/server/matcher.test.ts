import { describe, expect, it } from 'vitest'
import { makeSnippet, matchKeywords, qualifies } from './matcher.ts'

describe('matchKeywords', () => {
  const content = 'acme release notes for acmecorp billing'

  it('returns every keyword that appears, not just the first', () => {
    expect(matchKeywords(content, ['acme', 'billing', 'missing'])).toEqual(['acme', 'billing'])
  })

  it('is case-insensitive by default', () => {
    expect(matchKeywords('ACME Corp', ['acme'])).toEqual(['acme'])
  })

  it('respects caseSensitive', () => {
    expect(matchKeywords('ACME Corp', ['acme'], { caseSensitive: true })).toEqual([])
  })

  it('wholeWord does not match inside a larger word', () => {
    expect(matchKeywords('acmecorp', ['acme'], { wholeWord: true })).toEqual([])
    expect(matchKeywords('acme corp', ['acme'], { wholeWord: true })).toEqual(['acme'])
  })
})

describe('qualifies', () => {
  it('any mode needs one hit', () => {
    expect(qualifies(['acme'], 2, 'any')).toBe(true)
    expect(qualifies([], 2, 'any')).toBe(false)
  })

  it('all mode needs every keyword', () => {
    expect(qualifies(['acme'], 2, 'all')).toBe(false)
    expect(qualifies(['acme', 'billing'], 2, 'all')).toBe(true)
  })
})

describe('makeSnippet', () => {
  it('centres on the first matched keyword', () => {
    const snip = makeSnippet('acme release notes for acmecorp billing', ['billing'])
    expect(snip).toContain('billing')
  })

  it('returns empty string for empty content', () => {
    expect(makeSnippet('', ['x'])).toBe('')
  })
})
