import { projects } from '../src/data/projects.ts'
import { expect, test } from './fixtures.ts'

const deep = projects[projects.length - 1]

test('a project deep link loads directly and survives a refresh', async ({ page }) => {
  const res = await page.goto(`/projects/${deep.id}`)
  expect(res?.ok()).toBe(true)
  await expect(page.getByRole('heading', { level: 1, name: deep.name })).toBeVisible()

  await page.reload()
  await expect(page).toHaveURL(`/projects/${deep.id}`)
  await expect(page.getByRole('heading', { level: 1, name: deep.name })).toBeVisible()
})

test('a filtered projects link keeps its query after a refresh', async ({ page }) => {
  await page.goto('/projects?type=android')
  await page.reload()
  await expect(page).toHaveURL('/projects?type=android')
  await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible()
  for (const p of projects) {
    const card = page.locator(`main a[href="/projects/${p.id}"]`)
    if (p.kind === 'Android app') await expect(card.first()).toBeVisible()
    else await expect(card).toHaveCount(0)
  }
})

test('back after a refresh returns to the previous page', async ({ page }) => {
  await page.goto('/about')
  await page.getByRole('navigation', { name: 'Main' }).first().getByRole('link', { name: 'Contact' }).click()
  await expect(page).toHaveURL('/contact')
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Contact' })).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL('/about')
  await expect(page.getByRole('heading', { level: 1, name: 'About me' })).toBeVisible()
})
