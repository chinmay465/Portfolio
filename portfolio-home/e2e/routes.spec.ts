import { projects } from '../src/data/projects.ts'
import { expect, test } from './fixtures.ts'

const SITE = 'Chinmay Upare'

const pages = [
  { path: '/', heading: 'Chinmay Upare', title: `${SITE}, senior frontend developer` },
  { path: '/about', heading: 'About me', title: `About | ${SITE}` },
  { path: '/experience', heading: 'Experience', title: `Experience | ${SITE}` },
  { path: '/projects', heading: 'Projects', title: `Projects | ${SITE}` },
  { path: '/contact', heading: 'Contact', title: `Contact | ${SITE}` },
]

test.describe('pages', () => {
  for (const p of pages) {
    test(`${p.path} renders`, async ({ page }) => {
      await page.goto(p.path)
      await expect(page.getByRole('heading', { level: 1, name: p.heading })).toBeVisible()
      await expect(page).toHaveTitle(p.title)
      await expect(page.getByRole('navigation', { name: 'Main' }).first()).toBeVisible()
    })
  }

  test('/projects lists every project', async ({ page }) => {
    await page.goto('/projects')
    for (const p of projects) {
      await expect(page.locator(`a[href="/projects/${p.id}"]`).first()).toBeVisible()
    }
  })
})

test.describe('project pages', () => {
  for (const p of projects) {
    test(`/projects/${p.id} renders`, async ({ page }) => {
      await page.goto(`/projects/${p.id}`)
      await expect(page.getByRole('heading', { level: 1, name: p.name })).toBeVisible()
      await expect(page).toHaveTitle(`${p.name} | ${SITE}`)
      await expect(page.getByText(p.tagline).first()).toBeVisible()
      await expect(page.getByRole('navigation', { name: 'More projects' })).toBeVisible()
    })
  }

  test('previous and next links walk the catalogue', async ({ page }) => {
    const [first, second] = projects
    await page.goto(`/projects/${first.id}`)
    await page.getByRole('navigation', { name: 'More projects' }).getByRole('link', { name: `Next ${second.name}` }).click()
    await expect(page).toHaveURL(`/projects/${second.id}`)
    await expect(page.getByRole('heading', { level: 1, name: second.name })).toBeVisible()
  })
})

test.describe('not found', () => {
  test('an unknown path shows the 404 page', async ({ page }) => {
    await page.goto('/no-such-page')
    await expect(page.getByRole('heading', { level: 1, name: 'This page does not exist' })).toBeVisible()
    await expect(page).toHaveTitle(`Page not found | ${SITE}`)
    await page.getByRole('link', { name: 'Go home' }).click()
    await expect(page).toHaveURL('/')
    await expect(page.getByRole('heading', { level: 1, name: 'Chinmay Upare' })).toBeVisible()
  })

  test('an unknown project id shows the 404 page', async ({ page }) => {
    await page.goto('/projects/no-such-app')
    await expect(page.getByRole('heading', { level: 1, name: 'This page does not exist' })).toBeVisible()
  })
})
