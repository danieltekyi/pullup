const { chromium } = require('@playwright/test')

const OUT = 'C:\\Users\\danieltekyi\\OneDrive - Microsoft\\Documents\\Microsoft Scout\\pullup-shots'
const BASE = 'http://localhost:4180'

;(async () => {
  require('fs').mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  const calls = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message))
  page.on('response', r => {
    if (r.url().includes('/api/')) calls.push(`${r.status()} ${r.request().method()} ${r.url()}`)
  })

  // Step 1: login screen
  await page.goto(BASE + '/portal', { waitUntil: 'networkidle' })
  await page.screenshot({ path: `${OUT}\\portal-login.png` })
  console.log('login screen ok')

  // Step 2: request a code against the LIVE api
  await page.fill('#email', 'nobody@example.invalid')
  await page.click('button[type=submit]')
  await page.waitForTimeout(4000)
  await page.screenshot({ path: `${OUT}\\portal-code.png` })
  const bodyText = await page.evaluate(() => document.body.innerText)
  console.log('\n--- after submit ---')
  console.log(bodyText.split('\n').filter(Boolean).slice(0, 12).join('\n'))

  console.log('\nAPI CALLS:', calls.length ? calls : 'none')
  console.log('CONSOLE ERRORS:', errors.length ? errors : 'none')
  await browser.close()
})()
