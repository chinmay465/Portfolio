// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.tsx'
import { DEMO_CATALOG } from './data/catalog.ts'
import type { Title } from './types.ts'

// Each call to the TMDB helpers returns a promise the test settles by hand.
const pending = vi.hoisted(() => ({
  pool: [] as { resolve: (t: Title[]) => void; reject: (e: Error) => void }[],
  search: [] as { resolve: (t: Title[]) => void }[],
}))

vi.mock('./lib/tmdb.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('./lib/tmdb.ts')>()
  return {
    ...real,
    loadPool: vi.fn(() => new Promise<Title[]>((resolve, reject) => pending.pool.push({ resolve, reject }))),
    searchTitles: vi.fn(() => new Promise<Title[]>((resolve) => pending.search.push({ resolve }))),
  }
})

const live = (t: Title): Title => ({ ...t, id: `tmdb:${t.id}`, providers: ['netflix'] })
const [first, second] = DEMO_CATALOG.filter((t) => t.providers.includes('netflix')).map(live)

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false
  }
})

beforeEach(() => {
  pending.pool.length = 0
  pending.search.length = 0
  localStorage.clear()
  localStorage.setItem('ekatra:onboarded', 'true')
  localStorage.setItem('ekatra:services', JSON.stringify(['netflix']))
  localStorage.setItem('ekatra:source', JSON.stringify({ mode: 'tmdb', key: 'test-key' }))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('loading the live TMDB catalog', () => {
  it('shows skeleton cards, not the empty state, while the catalog loads', async () => {
    render(<App />)

    expect(screen.getAllByTestId('skeleton-card')).toHaveLength(12)
    expect(screen.getByRole('status')).toHaveProperty('textContent', 'Loading the live catalog from TMDB…')
    expect(screen.getByRole('heading', { name: 'Popular on your services' })).toBeTruthy()
    expect(screen.queryByText(/Nothing here yet/)).toBeNull()

    await act(async () => pending.pool[0].resolve([first, second]))

    expect(screen.queryAllByTestId('skeleton-card')).toHaveLength(0)
    expect(screen.getByRole('button', { name: `${first.name}, details` })).toBeTruthy()
  })

  it('keeps the skeleton cards out of the accessibility tree', () => {
    render(<App />)
    for (const card of screen.getAllByTestId('skeleton-card')) expect(card.getAttribute('aria-hidden')).toBe('true')
    expect(screen.getAllByTestId('skeleton-card')[0].closest('[aria-busy="true"]')).not.toBeNull()
  })

  it('swaps the skeleton for the error banner if the catalog fails', async () => {
    render(<App />)
    await act(async () => pending.pool[0].reject(new Error('Invalid API key.')))

    expect(screen.queryAllByTestId('skeleton-card')).toHaveLength(0)
    expect(screen.getByRole('alert').textContent).toContain('Invalid API key.')
  })

  it('shows the demo catalog straight away, with no skeleton', () => {
    localStorage.setItem('ekatra:source', JSON.stringify({ mode: 'demo' }))
    render(<App />)
    expect(screen.queryAllByTestId('skeleton-card')).toHaveLength(0)
  })
})

describe('live search', () => {
  it('shows skeleton cards while a search is in flight, then the results', async () => {
    vi.useFakeTimers()
    render(<App />)
    await act(async () => pending.pool[0].resolve([first]))

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'd' } })
    expect(screen.getByRole('heading', { name: 'Keep typing…' })).toBeTruthy()

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'dark' } })
    expect(screen.getByRole('heading', { name: 'Searching for “dark”…' })).toBeTruthy()
    expect(screen.getAllByTestId('skeleton-card')).toHaveLength(8)
    // The home feed doesn't show through while the search runs.
    expect(screen.queryByRole('heading', { name: 'Popular on your services' })).toBeNull()

    await act(async () => vi.advanceTimersByTime(400))
    await act(async () => pending.search[0].resolve([second]))

    expect(screen.queryAllByTestId('skeleton-card')).toHaveLength(0)
    expect(screen.getByRole('heading', { name: 'Results for “dark”' })).toBeTruthy()
    expect(screen.getByRole('button', { name: `${second.name}, details` })).toBeTruthy()
  })
})
