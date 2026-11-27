import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  // The first visit finds no recent check and runs one.
  await expect(page.getByTestId('deal').first()).toBeVisible({ timeout: 20_000 })
})

test('feed shows offers posted now, extraordinary ones first', async ({ page }) => {
  await expect(page.getByRole('status').filter({ hasText: 'extraordinary deals' })).toContainText('3 extraordinary deals')
  const first = page.getByTestId('deal').first()
  await expect(first).toHaveClass(/wow-deal/)
  await expect(page.getByTestId('deal')).toHaveCount(7)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(412)
})

test('filters by minimum discount and store', async ({ page }) => {
  await page.getByRole('button', { name: '90%+' }).click()
  await expect(page.getByTestId('deal')).toHaveCount(3)
  await page.getByRole('button', { name: 'Any %' }).click()
  await page.getByRole('group', { name: 'Store' }).getByRole('button', { name: /Zepto/ }).click()
  await expect(page.getByTestId('deal')).toHaveCount(1)
  await expect(page.getByTestId('deal')).toHaveAttribute('data-platform', 'zepto')
})

test('alert settings change what counts as a match, and stick', async ({ page }) => {
  await page.getByLabel('My alerts').check()
  // Default rule: 60%+ on the main stores, plus extraordinary deals.
  await expect(page.getByTestId('deal')).toHaveCount(4)

  await page.getByRole('tab', { name: 'Alerts' }).click()
  await page.getByLabel('Minimum discount', { exact: true }).fill('20')
  await page.getByRole('button', { name: 'Save alerts' }).click()
  await expect(page.getByRole('button', { name: 'Save alerts' })).toBeHidden()

  await page.reload()
  await page.getByLabel('My alerts').check()
  await expect(page.getByTestId('deal')).toHaveCount(6)
  await page.getByRole('tab', { name: 'Alerts' }).click()
  await expect(page.getByTestId('min-value')).toHaveText('20%')
})

test('sources show health and take extra channels', async ({ page }) => {
  await page.getByRole('tab', { name: 'Sources' }).click()
  await expect(page.getByText('DesiDime', { exact: true })).toBeVisible()
  await expect(page.getByText(/5 posts · checked/)).toBeVisible()
  await page.getByPlaceholder('t.me/channelname').fill('https://t.me/s/SomeLootDeals')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText('@SomeLootDeals')).toBeVisible()
})
