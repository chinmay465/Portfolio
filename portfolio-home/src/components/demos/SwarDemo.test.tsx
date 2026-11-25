// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { scrollIntoView, stubBrowser } from '../../test/dom'
import SwarDemo from './SwarDemo'

stubBrowser()

const demo = () => screen.getByRole('region', { name: /Swar, interactive demo/ })
const mini = () => screen.queryByRole('button', { name: /^Open the player/ })

describe('Swar demo', () => {
  afterEach(() => vi.useRealTimers())

  it('plays a quick pick and shows it in the mini player', () => {
    render(<SwarDemo reduced />)
    expect(mini()).toBeNull()
    fireEvent.click(within(demo()).getByRole('button', { name: 'Play Monsoon Drive by Indie Pune' }))
    expect(mini()?.getAttribute('aria-label')).toBe('Open the player: Monsoon Drive')
    expect(screen.getAllByRole('button', { name: 'Pause' }).length).toBeGreaterThan(0)
  })

  it('opens an album and plays it from a track', () => {
    render(<SwarDemo reduced />)
    fireEvent.click(screen.getByRole('button', { name: /^Platform 7/ }))
    expect(screen.getByRole('heading', { name: 'Platform 7' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Play Chai at Dawn by Lo-fi Mumbai' }))
    expect(mini()?.getAttribute('aria-label')).toBe('Open the player: Chai at Dawn')
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByText('Quick picks')).toBeTruthy()
  })

  it('opens the player from the mini player, likes the song, and it shows up in Library', () => {
    render(<SwarDemo reduced />)
    fireEvent.click(screen.getByRole('button', { name: 'Play Monsoon Drive by Indie Pune' }))
    fireEvent.click(mini()!)
    fireEvent.click(screen.getByRole('button', { name: 'Like' }))
    expect(screen.getByRole('button', { name: 'Unlike' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close the player' }))
    fireEvent.click(screen.getByRole('button', { name: 'Library' }))
    fireEvent.click(screen.getByRole('button', { name: /^Liked songs/ }))
    expect(screen.getByRole('button', { name: 'Play Monsoon Drive by Indie Pune' })).toBeTruthy()
  })

  it('searches the catalogue with filters', () => {
    render(<SwarDemo reduced />)
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Search the demo catalogue' }), { target: { value: 'mumbai' } })
    expect(screen.getByRole('button', { name: 'Play Late Train Home by Lo-fi Mumbai' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Albums' }))
    expect(screen.queryByRole('button', { name: 'Play Late Train Home by Lo-fi Mumbai' })).toBeNull()
    expect(screen.getByRole('button', { name: /^Platform 7/ })).toBeTruthy()
  })

  it('queues a song next from its menu', () => {
    render(<SwarDemo reduced />)
    fireEvent.click(screen.getByRole('button', { name: 'Play Monsoon Drive by Indie Pune' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'More for Konkan Coast' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Play next' }))
    expect(screen.getByRole('status').textContent).toBe('Playing next: Konkan Coast')
    fireEvent.click(mini()!)
    fireEvent.click(screen.getByRole('button', { name: 'Up next' }))
    const sheet = screen.getByRole('dialog', { name: 'Up next' })
    const titles = within(sheet).getAllByText(/./, { selector: '.sd-row-title' }).map((el) => el.textContent)
    expect(titles.slice(0, 2)).toEqual(['Monsoon Drive', 'Konkan Coast'])
  })

  it('moves to the next song when one ends', () => {
    vi.useFakeTimers()
    render(<SwarDemo reduced={false} />)
    // The demo only ticks while on screen.
    act(() => scrollIntoView())
    fireEvent.click(screen.getByRole('button', { name: 'Play Monsoon Drive by Indie Pune' }))
    fireEvent.click(mini()!)
    fireEvent.change(screen.getByRole('slider', { name: 'Seek' }), { target: { value: '213' } })
    act(() => vi.advanceTimersByTime(2100))
    expect(mini()?.getAttribute('aria-label')).not.toBe('Open the player: Monsoon Drive')
  })

  it('builds For you from what was played and drops songs skipped early', () => {
    render(<SwarDemo reduced />)
    // For you may list it too once it has been played: either starts its radio.
    const playMonsoon = () => fireEvent.click(screen.getAllByRole('button', { name: 'Play Monsoon Drive by Indie Pune' })[0])
    expect(screen.getByText('Your mix')).toBeTruthy()
    // Played earlier in the demo: Morning Raga, Late Train Home.
    expect(screen.getAllByText('Because you played').length).toBeGreaterThan(0)
    playMonsoon()
    const upNext = () => {
      fireEvent.click(mini()!)
      fireEvent.click(screen.getByRole('button', { name: 'Up next' }))
      const titles = within(screen.getByRole('dialog', { name: 'Up next' }))
        .getAllByText(/./, { selector: '.sd-row-title' })
        .map((el) => el.textContent)
      fireEvent.click(screen.getByRole('button', { name: 'Close' }))
      fireEvent.click(screen.getByRole('button', { name: 'Close the player' }))
      return titles
    }
    const first = upNext()
    const skipped = first[1]
    // Skip that song twice, right after it starts.
    const nextButton = () => within(demo()).getAllByRole('button', { name: 'Next' })[0]
    for (let i = 0; i < 2; i++) {
      playMonsoon()
      fireEvent.click(nextButton())
      expect(mini()?.getAttribute('aria-label')).toBe(`Open the player: ${skipped}`)
      fireEvent.click(nextButton())
    }
    playMonsoon()
    expect(upNext()).not.toContain(skipped)
  })

  it('downloads an album and lists it under Library, Downloads', () => {
    render(<SwarDemo reduced />)
    fireEvent.click(screen.getByRole('button', { name: /^Salt & Sand/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Download all' }))
    expect(screen.getByRole('status').textContent).toBe('Downloading 3 songs')
    expect(screen.getByRole('button', { name: 'Downloaded. Remove' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    fireEvent.click(screen.getByRole('button', { name: 'Library' }))
    fireEvent.click(screen.getByRole('button', { name: /^Downloads/ }))
    expect(screen.getByRole('heading', { name: 'Downloads' })).toBeTruthy()
    // Kept as the album, not as loose songs.
    expect(screen.queryByRole('button', { name: 'Play Konkan Coast by Coastal Folk' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Salt & Sand/ }))
    expect(screen.getByRole('heading', { name: 'Salt & Sand' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    fireEvent.click(mini()!)
    fireEvent.click(screen.getByRole('button', { name: 'Up next' }))
    const titles = within(screen.getByRole('dialog', { name: 'Up next' })).getAllByText(/./, { selector: '.sd-row-title' }).map((el) => el.textContent)
    // The album in order, then the other downloads (Chai at Dawn).
    expect(titles).toEqual(['Konkan Coast', 'Tide Tables', 'Fishing Nets', 'Chai at Dawn'])
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(screen.getByRole('button', { name: 'Play Konkan Coast by Coastal Folk' }))
    fireEvent.click(mini()!)
    expect(screen.getByText('Downloaded · plays offline')).toBeTruthy()
  })

  it('cancels the rest of an album download but keeps what finished', () => {
    vi.useFakeTimers()
    render(<SwarDemo reduced={false} />)
    act(() => scrollIntoView())
    fireEvent.click(screen.getByRole('button', { name: /^Salt & Sand/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Download all' }))
    act(() => vi.advanceTimersByTime(1600))
    fireEvent.click(screen.getByRole('button', { name: 'Downloading 1 of 3. Cancel' }))
    const dialog = screen.getByRole('dialog', { name: 'Stop downloading?' })
    expect(dialog.textContent).toContain('1 of these 3 songs are already downloaded')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep the 1 downloaded, cancel the rest' }))
    expect(screen.getByRole('button', { name: 'Download the other 2' })).toBeTruthy()
  })

  it('goes back a song from the mini player', () => {
    render(<SwarDemo reduced />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Play Monsoon Drive by Indie Pune' })[0])
    fireEvent.click(within(demo()).getAllByRole('button', { name: 'Next' })[0])
    expect(mini()?.getAttribute('aria-label')).not.toBe('Open the player: Monsoon Drive')
    fireEvent.click(within(demo()).getAllByRole('button', { name: 'Previous' })[0])
    expect(mini()?.getAttribute('aria-label')).toBe('Open the player: Monsoon Drive')
  })

  it('deletes chosen downloads in edit mode', () => {
    render(<SwarDemo reduced />)
    fireEvent.click(screen.getByRole('button', { name: /^Salt & Sand/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Download all' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    fireEvent.click(screen.getByRole('button', { name: 'Library' }))
    fireEvent.click(screen.getByRole('button', { name: /^Downloads/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Salt & Sand' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete (1)' }))
    expect(screen.getByRole('status').textContent).toBe('Deleted 3 songs')
    expect(screen.queryByRole('button', { name: /^Salt & Sand/ })).toBeNull()
    // The song downloaded on its own is still there.
    expect(screen.getByRole('button', { name: 'Play Chai at Dawn by Lo-fi Mumbai' })).toBeTruthy()
  })

  it('shows the listening pulse, On repeat and a fresh start after clearing history', () => {
    render(<SwarDemo reduced />)
    fireEvent.click(screen.getByRole('button', { name: 'Library' }))
    const pulse = screen.getByRole('region', { name: 'Listening pulse' })
    expect(pulse.textContent).toContain('Mostly Indie Pune lately')
    // Morning Raga has the most plays.
    expect(screen.getByRole('button', { name: 'Play Morning Raga, number 1 on repeat' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear listening history on this phone' }))
    expect(screen.getByRole('status').textContent).toBe('Listening history on this phone cleared')
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByText('Your pulse starts with your first song')).toBeTruthy()
    expect(screen.queryByText('On repeat')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^History/ }))
    expect(screen.getByText('Nothing played yet')).toBeTruthy()
  })

  it('adds a song to a playlist, then takes it out from the playlist page', () => {
    render(<SwarDemo reduced />)
    fireEvent.click(screen.getAllByRole('button', { name: 'More for Konkan Coast' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Add to or remove from playlist' }))
    const sheet = screen.getByRole('dialog', { name: 'Save to playlist' })
    // Already in Road trip.
    expect(within(sheet).getByRole('button', { name: 'Road trip: in this playlist, tap to remove' })).toBeTruthy()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Late night: tap to add' }))
    expect(screen.getByRole('status').textContent).toBe('Added to Late night')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(screen.getByRole('button', { name: 'Library' }))
    fireEvent.click(screen.getByRole('button', { name: /^Late night/ }))
    expect(screen.getByRole('heading', { name: 'Late night' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'More for Konkan Coast' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove from this playlist' }))
    expect(screen.getByText('This playlist is empty')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Find music' }))
    expect(screen.getByRole('textbox', { name: 'Search the demo catalogue' })).toBeTruthy()
  })

  it('makes a new playlist with the song in it', () => {
    render(<SwarDemo reduced />)
    fireEvent.click(screen.getAllByRole('button', { name: 'More for Konkan Coast' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Add to or remove from playlist' }))
    fireEvent.click(screen.getByRole('button', { name: 'New playlist' }))
    const dialog = screen.getByRole('dialog', { name: 'New playlist' })
    expect((within(dialog).getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Playlist name' }), { target: { value: 'Beach' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }))
    expect(screen.getByRole('status').textContent).toBe('Made Beach with this song')
    fireEvent.click(screen.getByRole('button', { name: 'Library' }))
    fireEvent.click(screen.getByRole('button', { name: /^Beach/ }))
    expect(screen.getByRole('button', { name: 'Play Konkan Coast by Coastal Folk' })).toBeTruthy()
  })

  it('hides songs that are unavailable on YouTube Music', () => {
    render(<SwarDemo reduced />)
    fireEvent.click(screen.getByRole('button', { name: 'Library' }))
    fireEvent.click(screen.getByRole('button', { name: /^Playlists/ }))
    fireEvent.click(screen.getByRole('button', { name: /^My Supermix/ }))
    expect(screen.getByRole('button', { name: 'Play Monsoon Drive by Indie Pune' })).toBeTruthy()
    expect(screen.queryByText('Old Demo Tape')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Download all' }))
    expect(screen.getByRole('status').textContent).toBe('Downloading 6 songs')
  })

  it('switches between the song and its music video version', () => {
    render(<SwarDemo reduced />)
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Search the demo catalogue' }), { target: { value: 'paper' } })
    fireEvent.click(screen.getByRole('button', { name: 'Play Paper Boats by Indie Pune' }))
    fireEvent.click(mini()!)
    // Better quality: the video's audio is clearly better for this one.
    expect(screen.getByRole('button', { name: 'Video' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText(/video's audio · 160 kbps/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Song' }))
    expect(screen.getByRole('button', { name: 'Song' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('offers only the cache sizes that fit the phone', () => {
    render(<SwarDemo reduced />)
    fireEvent.click(screen.getByRole('button', { name: 'Library' }))
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect((screen.getByRole('button', { name: /^8 GB · not enough free space/ }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /^2 GB/ }))
    expect(screen.getByText(/Using 46 MB of 2 GB/)).toBeTruthy()
  })

  it('says when a search finds nothing', () => {
    render(<SwarDemo reduced />)
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Search the demo catalogue' }), { target: { value: 'zzz' } })
    expect(screen.getByText('No results for “zzz”')).toBeTruthy()
  })
})
