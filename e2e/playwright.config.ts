import { defineConfig, devices } from '@playwright/test'

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:4173'

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  fullyParallel: true,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  /**
   * Build and serve the customer app so the suite runs from a clean checkout.
   * Skipped when E2E_BASE_URL points at an already-running or deployed site.
   */
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run build:customer --workspace=@pullup/frontend && npm run preview:customer --workspace=@pullup/frontend',
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        cwd: '..',
      },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
})
