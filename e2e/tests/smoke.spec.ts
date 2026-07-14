import { test, expect } from '@playwright/test'

/**
 * Placeholder E2E — replace with real Cognito test user once dev env is provisioned.
 */
test.describe('smoke', () => {
  test('login page renders', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByText('PullUp Delivery')).toBeVisible()
    await expect(page.getByLabel(/email/i)).toBeVisible()
    await expect(page.getByLabel(/password/i)).toBeVisible()
  })

  test('track page shows error without token', async ({ page }) => {
    await page.goto('/track')
    await expect(page.getByText(/link unavailable|no tracking token/i)).toBeVisible()
  })
})
