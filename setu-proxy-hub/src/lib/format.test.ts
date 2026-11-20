import { describe, expect, it } from 'vitest'
import { ago, asUrl, bytes } from './format.ts'

describe('format', () => {
  it('detects URLs vs search queries', () => {
    expect(asUrl('example.com')).toBe('https://example.com')
    expect(asUrl('https://a.b/c?d')).toBe('https://a.b/c?d')
    expect(asUrl('react testing library')).toBeNull()
    expect(asUrl('hello')).toBeNull()
  })
  it('formats bytes and relative time', () => {
    expect(bytes(512)).toBe('512 B')
    expect(bytes(2048)).toBe('2.0 KB')
    expect(ago(1000, 31000)).toBe('30s ago')
    expect(ago(null)).toBe('—')
  })
})
