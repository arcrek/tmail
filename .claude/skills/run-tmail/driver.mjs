// Live-browser driver for tmail. Drives the real Vue app (public inbox
// + admin console) against a real FastAPI backend (fake_jmap_server.py
// stands in for Stalwart). Requires the sysroot's libs on
// LD_LIBRARY_PATH — see SKILL.md.
//
// Usage: node driver.mjs [baseUrl] [outDir] [adminPassword]
import { chromium } from 'playwright'
import fs from 'node:fs'

const BASE = process.argv[2] || 'http://127.0.0.1:8099'
const OUT = process.argv[3] || new URL('.cache/run/shots', import.meta.url).pathname
const ADMIN_PASSWORD = process.argv[4] || 'admin-secret-pw'
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const errors = []

// ---------- Public inbox: create address, live JMAP messages, search filter ----------
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[public] ${m.text()}`) })

  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await page.waitForSelector('#local-part', { timeout: 10000 })
  await page.fill('#local-part', 'demo.user')
  await page.screenshot({ path: `${OUT}/01-address-form.png`, fullPage: true })

  await page.click('button.primary-button[type=submit]')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/02-inbox-live-messages.png`, fullPage: true })

  // client-side search/filter (InboxView.vue #message-search)
  await page.fill('#message-search', 'Invoice')
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/03-inbox-search-filtered.png`, fullPage: true })

  await context.close()
}

// ---------- Admin console: login, wildcard blacklist, dashboard MX health ----------
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[admin] ${m.text()}`) })

  await page.goto(BASE + '/admin', { waitUntil: 'networkidle' })
  await page.waitForSelector('#admin-password', { timeout: 10000 })
  await page.fill('#admin-password', ADMIN_PASSWORD)
  await page.click('button.primary-button[type=submit]')
  await page.waitForSelector('#admin-tab-0', { timeout: 10000 })

  // Dashboard tab (index 0): message/domain stats + MX health
  await page.click('#admin-tab-0')
  await page.waitForSelector('text=Dashboard', { timeout: 10000 })
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/04-dashboard.png`, fullPage: true })

  // Domains & Inbox tab (index 3): wildcard blacklist rule
  await page.click('#admin-tab-3')
  await page.waitForSelector('#blacklisted-domains', { timeout: 10000 })
  await page.screenshot({ path: `${OUT}/05-domains-tab-before.png`, fullPage: true })

  await page.fill('#blacklisted-domains', '*.example.com')
  await page.click('.settings-form:has(#blacklisted-domains) button[type=submit]')
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/06-domains-tab-after-blacklist.png`, fullPage: true })

  await context.close()
}

await browser.close()

if (errors.length) {
  console.log('CONSOLE ERRORS:')
  for (const e of errors) console.log(' -', e)
} else {
  console.log('NO CONSOLE ERRORS')
}
console.log(`screenshots in ${OUT}`)
console.log('DONE')
