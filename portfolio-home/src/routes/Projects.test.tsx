// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { projects, type ProjectId } from '../data/projects'
import { stubBrowser } from '../test/dom'
import Projects from './Projects'

stubBrowser()

const names = (ids: ProjectId[]) => ids.map((id) => projects.find((p) => p.id === id)!.name)

async function open(url: string) {
  const router = createMemoryRouter([{ path: '/projects', Component: Projects }], { initialEntries: [url] })
  render(<RouterProvider router={router} />)
  await screen.findByRole('tablist', { name: 'Filter projects' })
  return router
}

const cards = () =>
  [...document.querySelectorAll('article.pcx')].map((card) => within(card as HTMLElement).getByRole('heading').textContent)

const selected = () => screen.getByRole('tab', { selected: true }).firstChild?.textContent

describe('/projects filter', () => {
  it('shows every app by default', async () => {
    await open('/projects')
    expect(cards()).toEqual(projects.map((p) => p.name))
    expect(selected()).toBe('All')
  })

  it('?type=web shows only the web apps', async () => {
    await open('/projects?type=web')
    expect(cards()).toEqual(names(['rail', 'ekatra', 'ank', 'shodh', 'setu']))
    expect(selected()).toBe('Web apps')
    expect(screen.getByRole('region', { name: 'Web apps' })).toBeTruthy()
  })

  it('?type=android shows only the Android apps', async () => {
    await open('/projects?type=android')
    expect(cards()).toEqual(names(['kavach', 'swar']))
    expect(selected()).toBe('Android apps')
  })

  it('falls back to every app for an unknown type', async () => {
    await open('/projects?type=desktop')
    expect(cards()).toHaveLength(projects.length)
    expect(selected()).toBe('All')
  })

  it('counts each filter on its tab', async () => {
    await open('/projects')
    const count = (label: string) => screen.getByRole('tab', { name: new RegExp(`^${label}`) }).querySelector('span')?.textContent
    expect(count('All')).toBe(String(projects.length))
    expect(count('Web apps')).toBe('5')
    expect(count('Android apps')).toBe('2')
  })

  it('updates the URL and the cards when a tab is pressed', async () => {
    const router = await open('/projects')
    fireEvent.click(screen.getByRole('tab', { name: /^Android apps/ }))
    expect(router.state.location.search).toBe('?type=android')
    expect(cards()).toEqual(names(['kavach', 'swar']))
    fireEvent.click(screen.getByRole('tab', { name: /^All/ }))
    expect(router.state.location.search).toBe('')
    expect(cards()).toHaveLength(projects.length)
  })
})
