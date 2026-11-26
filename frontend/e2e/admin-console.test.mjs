import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { ADMIN_PASSWORD, startE2EEnvironment } from './helpers/harness.mjs'

describe('Admin console and access gate E2E journey', () => {
  let env

  before(async () => {
    env = await startE2EEnvironment()
  })

  after(async () => {
    await env?.close()
  })

  it('rejects bad admin credentials, updates site branding, and provisions a working public unlock credential', async () => {
    const { context, page, pageErrors } = await env.newIsolatedPage()
    try {
      await page.goto(`${env.baseUrl}/admin`)
      await page.locator('#admin-password').waitFor()

      // Wrong password must fail and stay on login screen.
      await page.locator('#admin-password').fill('wrong-password')
      await page.locator('.admin-login button[type="submit"]').click()
      await page.locator('.admin-error').waitFor()
      assert.equal(await page.locator('.admin-shell').count(), 0)

      // Valid login enters the admin console.
      await page.locator('#admin-password').fill(ADMIN_PASSWORD)
      await page.locator('.admin-login button[type="submit"]').click()
      await page.locator('.admin-shell').waitFor()

      // Domains tab shows the configured domain.
      await page.getByRole('tab', { name: 'Domains' }).click()
      await page.locator('.domain-list').waitFor()
      assert((await page.locator('.domain-list').innerText()).includes('example.com'))

      // General tab updates appName and persists it to the public site.
      await page.getByRole('tab', { name: 'General' }).click()
      await page.locator('#app-name').waitFor()
      await page.locator('#app-name').fill('TMail E2E Brand')
      await page.locator('.settings-form button[type="submit"]').click()
      await page.waitForFunction(() => document.querySelector('.admin-brand-name')?.textContent?.includes('TMail E2E Brand'))

      // Access tab creates a password credential for the public unlock gate.
      await page.getByRole('tab', { name: 'Access' }).click()
      await page.locator('input#access-password-label').waitFor()
      await page.locator('input#access-password-label').fill('QA Tester')
      await page.locator('#access-password').fill('e2e-unlock-pass')
      await page.locator('#access-password-confirm').fill('e2e-unlock-pass')
      await page.locator('.settings-form button.primary-button[type="submit"]').click()
      await page.waitForFunction(() => document.querySelector('[role="grid"]')?.textContent?.includes('QA Tester'))

      // Sign out of admin and verify session is cleared.
      await page.locator('.rail-signout').click()
      await page.locator('#admin-password').waitFor()

      // Public site reflects updated appName and enforces the access credential gate.
      await page.goto(`${env.baseUrl}/`)
      await page.waitForFunction(() => document.title === 'TMail E2E Brand')
      assert.equal(await page.locator('.brand-name').innerText(), 'TMail E2E Brand')

      await page.locator('.header-unlock button').click()
      await page.locator('#header-access-credential').fill('wrong-unlock-pass')
      await page.locator('.header-unlock form button[type="submit"]').click()
      await page.locator('[role="alert"], .toast-item').first().waitFor()
      assert.equal(await page.locator('.header-unlock [aria-live="polite"]').count(), 0)

      await page.locator('#header-access-credential').fill('e2e-unlock-pass')
      await page.locator('.header-unlock form button[type="submit"]').click()
      await page.locator('.header-unlock [aria-live="polite"]').waitFor()

      // Locking returns to the locked state.
      await page.locator('.header-unlock button').click()
      await page.locator('.header-unlock [aria-live="polite"]').waitFor({ state: 'detached' })

      assert.deepEqual(pageErrors, [])
    } finally {
      await context.close()
    }
  })
})
