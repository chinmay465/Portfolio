import { expect, test } from './fixtures.ts'

const dialog = (page: import('@playwright/test').Page) => page.getByRole('dialog', { name: 'Jump to' })
const search = (page: import('@playwright/test').Page) => page.getByRole('textbox', { name: 'Search pages, projects and links' })

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Chinmay Upare' })).toBeVisible()
})

test('Ctrl K opens the palette with the search focused, Escape closes it', async ({ page }) => {
  await page.keyboard.press('ControlOrMeta+k')
  await expect(dialog(page)).toBeVisible()
  await expect(search(page)).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toBeHidden()
})

test('search, then Enter, opens the top match', async ({ page }) => {
  await page.keyboard.press('ControlOrMeta+k')
  await search(page).fill('ekatra')
  const options = dialog(page).getByRole('option')
  await expect(options.first()).toContainText('Ekatra')
  await expect(options.first()).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/projects/ekatra')
  await expect(page.getByRole('heading', { level: 1, name: 'Ekatra' })).toBeVisible()
  await expect(dialog(page)).toBeHidden()
})

test('arrow keys move the selection and Enter opens it', async ({ page }) => {
  await page.keyboard.press('ControlOrMeta+k')
  await search(page).fill('page')
  await page.keyboard.press('ArrowDown')
  const selected = dialog(page).locator('[role="option"][aria-selected="true"]')
  await expect(selected).toContainText('About me')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/about')
  await expect(page.getByRole('heading', { level: 1, name: 'About me' })).toBeVisible()
})

test('clicking a result navigates', async ({ page }) => {
  await page.getByRole('button', { name: /Jump to/ }).click()
  await search(page).fill('contact')
  await dialog(page).getByRole('link', { name: /Email and contact/ }).click()
  await expect(page).toHaveURL('/contact')
  await expect(page.getByRole('heading', { level: 1, name: 'Contact' })).toBeVisible()
})

test('a search with no match says so', async ({ page }) => {
  await page.keyboard.press('/')
  await search(page).fill('zzzz')
  await expect(dialog(page)).toContainText('Nothing matches “zzzz”')
})
