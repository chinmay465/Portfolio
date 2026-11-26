import { describe, expect, it, vi } from 'vitest'
import { externalReferrer, ID_KEY, OPT_OUT_KEY, SENT_KEY, trackVisitor } from './visitor'
import type { TrackEnv } from './visitor'

function storage(): Storage {
  const m = new Map<string, string>()
  return {
    get length() {
      return m.size
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  }
}

function env(over: Partial<TrackEnv> = {}): TrackEnv & { fetch: ReturnType<typeof vi.fn> } {
  return {
    location: { pathname: '/projects', search: '', host: 'chinmay-upare.onrender.com' },
    referrer: 'https://www.linkedin.com/feed/',
    local: storage(),
    session: storage(),
    webdriver: false,
    fetch: vi.fn(async () => new Response('{}', { status: 200 })),
    newId: () => '3f2b8c1e-6d4a-4b7e-9c2f-1a2b3c4d5e6f',
    ...over,
  } as TrackEnv & { fetch: ReturnType<typeof vi.fn> }
}

describe('trackVisitor', () => {
  it('sends one visit per session with a stable id', async () => {
    const e = env()
    expect(await trackVisitor(e, 'https://api.test')).toBe('sent')
    expect(await trackVisitor({ ...e, location: { ...e.location, pathname: '/about' } }, 'https://api.test')).toBe('skipped')
    expect(e.fetch).toHaveBeenCalledTimes(1)
    const [url, init] = e.fetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.test/api/visit')
    expect(JSON.parse(init.body as string)).toEqual({
      id: '3f2b8c1e-6d4a-4b7e-9c2f-1a2b3c4d5e6f',
      path: '/projects',
      referrer: 'https://www.linkedin.com/feed/',
    })
    expect(e.local.getItem(ID_KEY)).toBe('3f2b8c1e-6d4a-4b7e-9c2f-1a2b3c4d5e6f')
  })

  it('reuses the id in a new session', async () => {
    const e = env()
    await trackVisitor(e, 'https://api.test')
    const next = env({ local: e.local, newId: () => 'other' })
    await trackVisitor(next, 'https://api.test')
    expect(JSON.parse((next.fetch.mock.calls[0] as [string, RequestInit])[1].body as string).id).toBe(
      '3f2b8c1e-6d4a-4b7e-9c2f-1a2b3c4d5e6f',
    )
  })

  it('retries next load when the server fails', async () => {
    const e = env({ fetch: vi.fn(async () => new Response('', { status: 503 })) })
    expect(await trackVisitor(e, 'https://api.test')).toBe('skipped')
    expect(e.session.getItem(SENT_KEY)).toBeNull()
  })

  it('skips automated browsers and opted-out browsers', async () => {
    const bot = env({ webdriver: true })
    expect(await trackVisitor(bot, 'https://api.test')).toBe('skipped')
    expect(bot.fetch).not.toHaveBeenCalled()

    const me = env({ location: { pathname: '/', search: '?notrack', host: 'x' } })
    expect(await trackVisitor(me, 'https://api.test')).toBe('skipped')
    expect(me.local.getItem(OPT_OUT_KEY)).toBe('1')
    expect(me.fetch).not.toHaveBeenCalled()
  })

  it('never throws when storage is blocked', async () => {
    const blocked = storage()
    blocked.getItem = () => {
      throw new Error('SecurityError')
    }
    expect(await trackVisitor(env({ local: blocked }), 'https://api.test')).toBe('skipped')
  })
})

describe('externalReferrer', () => {
  it('drops same-site and malformed referrers', () => {
    expect(externalReferrer('https://chinmay-upare.onrender.com/about', 'chinmay-upare.onrender.com')).toBe('')
    expect(externalReferrer('nonsense', 'x')).toBe('')
    expect(externalReferrer('https://google.com/', 'x')).toBe('https://google.com/')
  })
})
