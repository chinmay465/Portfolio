// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { stubBrowser } from '../../test/dom'
import EkatraDemo from './EkatraDemo'
import { EMPTY, TITLES, handoff, recommend, serviceBy, similar, titleById } from './ekatraData'

stubBrowser()

const demo = () => screen.getByRole('region', { name: /Ekatra for Android, interactive demo/ })
const open = (name: RegExp) => fireEvent.click(within(demo()).getAllByRole('button', { name })[0])
const tab = (name: string) => fireEvent.click(within(screen.getByRole('navigation', { name: 'Ekatra tabs' })).getByRole('button', { name }))

describe('Ekatra demo', () => {
  afterEach(() => vi.useRealTimers())

  it('shows the hand-off steps before landing in the app', () => {
    vi.useFakeTimers()
    render(<EkatraDemo reduced={false} />)
    open(/^Village Wi-Fi, on Prime Video/)
    fireEvent.click(screen.getByRole('button', { name: 'Watch Village Wi-Fi in the Prime Video app' }))
    const sheet = () => screen.getByRole('dialog', { name: 'Opening Village Wi-Fi in Prime Video' })
    expect(within(sheet()).getByText('Handing off')).toBeTruthy()
    expect(within(sheet()).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      "Village Wi-Fi's own page in the Prime Video app",
      'Prime Video\'s search for “Village Wi-Fi”',
      'Prime Video app, with “Village Wi-Fi” copied for its search',
    ])
    act(() => vi.advanceTimersByTime(1000))
    expect(within(sheet()).getByRole('button', { name: 'Back to Ekatra' })).toBeTruthy()
  })

  it('hands a Netflix title to the app, walking the plan, and puts it in Continue watching', () => {
    render(<EkatraDemo reduced />)
    open(/^Monsoon Files, on Netflix/)
    expect(screen.getByRole('heading', { name: 'Monsoon Files' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Watch Monsoon Files in the Netflix app' }))
    const sheet = screen.getByRole('dialog', { name: 'Opening Monsoon Files in Netflix' })
    expect(within(sheet).getByText(/Opened on Monsoon Files itself/)).toBeTruthy()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Back to Ekatra' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    const shelf = screen.getByRole('region', { name: 'Continue watching' })
    expect(within(shelf).getByText('On Netflix')).toBeTruthy()
  })

  it('plays a title on the service site in Ekatra', () => {
    render(<EkatraDemo reduced />)
    open(/^Village Wi-Fi, on Prime Video/)
    fireEvent.click(screen.getByRole('button', { name: 'Watch Village Wi-Fi on Prime Video in Ekatra' }))
    const web = screen.getByRole('dialog', { name: 'Prime Video in Ekatra' })
    fireEvent.click(within(web).getByRole('button', { name: 'Play Village Wi-Fi' }))
    expect(within(web).getByRole('button', { name: 'Pause Village Wi-Fi' })).toBeTruthy()
    fireEvent.click(within(web).getByRole('button', { name: 'Desktop site (tap for phone site)' }))
    expect(within(web).getByRole('button', { name: 'Phone site (tap for desktop site)' })).toBeTruthy()
    fireEvent.click(within(web).getByRole('button', { name: 'Close Prime Video' }))
    expect(screen.queryByRole('dialog', { name: 'Prime Video in Ekatra' })).toBeNull()
  })

  it('opens a service that is not installed on its website', () => {
    render(<EkatraDemo reduced />)
    open(/^Dalal Street ’92, on SonyLIV/)
    expect(screen.queryByRole('button', { name: /in the SonyLIV app/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Watch Dalal Street ’92 on SonyLIV in Ekatra' }))
    expect(screen.getByRole('dialog', { name: 'SonyLIV in Ekatra' })).toBeTruthy()
  })

  it('filters Home to one service', () => {
    render(<EkatraDemo reduced />)
    fireEvent.click(within(screen.getByRole('group', { name: 'Filter by service' })).getByRole('button', { name: 'ZEE5' }))
    expect(screen.getByRole('region', { name: 'Top on ZEE5' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Top on Netflix' })).toBeNull()
    const posters = within(demo()).getAllByRole('button', { name: /, on / })
    expect(posters.every((b) => /ZEE5/.test(b.getAttribute('aria-label') ?? ''))).toBe(true)
  })

  it('searches every app with a films or series filter', () => {
    render(<EkatraDemo reduced />)
    tab('Search')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search every app' }), { target: { value: 'mumbai' } })
    expect(screen.getByRole('button', { name: /^The Last Local, on Netflix/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Monsoon Files, on Netflix/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Films' }))
    expect(screen.queryByRole('button', { name: /^Monsoon Files, on Netflix/ })).toBeNull()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search every app' }), { target: { value: 'zzzz' } })
    expect(screen.getByText('No results')).toBeTruthy()
  })

  it('saves to My List and likes shape For you', () => {
    render(<EkatraDemo reduced />)
    open(/^Kitchen Kings, on Netflix/)
    fireEvent.click(screen.getByRole('button', { name: 'Add to My List' }))
    expect(screen.getByRole('status').textContent).toBe('Added to My List')
    fireEvent.click(screen.getByRole('button', { name: 'Like' }))
    tab('My List')
    expect(screen.getByRole('button', { name: /^Kitchen Kings, on Netflix/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Liked' }))
    expect(screen.getByRole('button', { name: /^Kitchen Kings, on Netflix/ })).toBeTruthy()
    tab('Home')
    expect(within(demo()).getAllByText(/Because you liked Kitchen Kings|Like Kitchen Kings in My List/).length).toBeGreaterThan(0)
  })

  it('ticks subscriptions in Apps and opens a service tab', () => {
    render(<EkatraDemo reduced />)
    tab('Apps')
    fireEvent.click(screen.getByRole('button', { name: 'I subscribe to JioHotstar' }))
    expect(screen.getByRole('button', { name: 'I subscribe to JioHotstar' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Open JioHotstar in Ekatra' }))
    const web = screen.getByRole('dialog', { name: 'JioHotstar in Ekatra' })
    fireEvent.click(within(web).getByRole('button', { name: 'High Tide on www.hotstar.com' }))
    expect(within(web).getByRole('button', { name: 'Play High Tide' })).toBeTruthy()
    fireEvent.click(within(web).getByRole('button', { name: 'Close JioHotstar' }))
    tab('Home')
    expect(within(screen.getByRole('group', { name: 'Filter by service' })).queryByRole('button', { name: 'Netflix' })).toBeNull()
  })
})

describe('Ekatra demo data', () => {
  it('walks the same hand-off order as the app', () => {
    const monsoon = titleById('monsoon-files')!
    expect(handoff(monsoon, serviceBy('netflix'), false).steps.map((s) => s.kind)).toEqual(['page', 'page', 'home'])
    const bear = titleById('high-tide')!
    expect(handoff(bear, serviceBy('jiohotstar'), false).steps.map((s) => s.kind)).toEqual(['home'])
    expect(handoff(titleById('society-4')!, serviceBy('zee5'), false).lands.kind).toBe('web')
    expect(handoff(monsoon, serviceBy('netflix'), true).lands.kind).toBe('web')
  })

  it('recommends popular titles first and mixes services', () => {
    const picks = recommend(TITLES, EMPTY, [], 10)
    expect(picks).toHaveLength(10)
    expect(new Set(picks.slice(0, 5).map((p) => p.title.services[0])).size).toBeGreaterThan(1)
  })

  it('finds neighbours and skips disliked titles', () => {
    const ganga = titleById('ganga-gold')!
    const near = similar(ganga, TITLES, [], ['gorakhpur-rising'])
    expect(near.map((x) => x.id)).not.toContain('gorakhpur-rising')
    expect(near[0].genres).toContain('Crime')
  })
})
