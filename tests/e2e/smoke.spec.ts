import { expect, test } from '@playwright/test'

test('serves the placeholder home page', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveTitle('Form Handler')
  await expect(page.getByRole('heading', { name: 'Form Handler' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
})
