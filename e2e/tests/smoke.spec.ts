import { test, expect } from '@playwright/test'

/**
 * Smoke tests for the public customer app (VITE_APP_MODE=customer).
 *
 * These replace a placeholder suite that asserted an email/password login form
 * belonging to the Cognito auth removed in v2.1.0 — it failed on every run and
 * gave false confidence (DEF-011). The customer build is the only mode testable
 * without credentials; admin, rider and partner sit behind Cloudflare Access
 * and one-time codes.
 */

test.describe('customer landing', () => {
  test('renders the hero and tracking entry point', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /track your delivery/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^track$/i })).toBeVisible()
  })

  test('exposes the order call to action', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: /place a delivery order/i })).toBeVisible()
  })

  test('navigates to the order form', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /place a delivery order/i }).click()
    await expect(page).toHaveURL(/\/order/)
    await expect(page.getByRole('heading', { name: /request a delivery/i })).toBeVisible()
  })
})

test.describe('order form', () => {
  test('does not submit while required fields are empty', async ({ page }) => {
    await page.goto('/order')
    await page.getByRole('button', { name: /submit order request/i }).click()
    await expect(page).not.toHaveURL(/order-confirmation/)
  })
})

test.describe('tracking', () => {
  test('handles a missing order reference', async ({ page }) => {
    await page.goto('/track')
    await expect(page.locator('body')).toBeVisible()
    // Must not crash to a blank page (DEF-005 guard).
    await expect(page.locator('#root')).not.toBeEmpty()
  })

  /**
   * Regression guard for DEF-001. A partial ID must never resolve to somebody
   * else's delivery — this endpoint previously prefix-matched with SQL LIKE, so
   * a one-character value returned a real customer's name and address.
   */
  test('a partial order id never reveals an order', async ({ page }) => {
    await page.goto('/track?orderId=ord')
    await expect(page.getByText(/12 Ring Rd|Osu, Accra/i)).toHaveCount(0)
    await expect(page.locator('#root')).not.toBeEmpty()
  })
})
