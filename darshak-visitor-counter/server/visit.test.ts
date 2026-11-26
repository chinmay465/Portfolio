import { describe, expect, it } from 'vitest'
import { cleanPath, cleanReferrer, deviceOf, isBot, parseVisit } from './visit.ts'

const ID = '3F2B8C1E-6D4A-4B7E-9C2F-1A2B3C4D5E6F'

describe('visit parsing', () => {
  it('parses a text/plain JSON body and normalises it', () => {
    expect(parseVisit(JSON.stringify({ id: ID, path: '/projects/rail/?x=1#demo', referrer: 'https://www.google.com/search?q=chinmay' }), 'iPhone Mobile')).toEqual({
      id: ID.toLowerCase(),
      path: '/projects/rail',
      referrer: 'google.com',
      device: 'mobile',
    })
  })

  it('rejects bodies without a valid uuid', () => {
    expect(parseVisit('{"id":"123"}', '')).toBeNull()
    expect(parseVisit('not json', '')).toBeNull()
    expect(parseVisit(null, '')).toBeNull()
  })

  it('cleans paths and referrers', () => {
    expect(cleanPath('https://x.com/')).toBe('/')
    expect(cleanPath('/')).toBe('/')
    expect(cleanReferrer('javascript:alert(1)')).toBeNull()
    expect(cleanReferrer('')).toBeNull()
  })

  it('spots bots and devices', () => {
    expect(isBot('Mozilla/5.0 (compatible; Googlebot/2.1)')).toBe(true)
    expect(isBot('Mozilla/5.0 HeadlessChrome/131.0')).toBe(true)
    expect(isBot(undefined)).toBe(true)
    expect(isBot('Mozilla/5.0 (Macintosh) Safari/605.1.15')).toBe(false)
    expect(deviceOf('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari')).toBe('mobile')
    expect(deviceOf('Mozilla/5.0 (iPad; CPU OS 17_0)')).toBe('tablet')
    expect(deviceOf('Mozilla/5.0 (Windows NT 10.0)')).toBe('desktop')
  })
})

describe('describeError', () => {
  it('never leaks the connection string', async () => {
    const { describeError } = await import('./db.ts')
    const msg = describeError(new Error('bad url postgresql://u:secret@host/db?sslmode=require'))
    expect(msg).not.toContain('secret')
  })
})
