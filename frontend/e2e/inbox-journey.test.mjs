import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { startE2EEnvironment } from './helpers/harness.mjs'

describe('Public inbox E2E journey', () => {
  let env

  before(async () => {
    env = await startE2EEnvironment()
  })

  after(async () => {
    await env?.close()
  })

  it('creates an address, reads a verification-code message, and persists deletion across reload', async () => {
    const { context, page, pageErrors } = await env.newIsolatedPage()
    try {
      await page.goto(`${env.baseUrl}/`)

      // Create a mailbox on the active domain from the home form.
      await page.locator('#local-part').fill('e2e.inbox')
      await page.locator('.address-form button.primary-button[type="submit"]').click()
      await page.locator('.inbox-view').waitFor()
      assert.equal(decodeURIComponent(new URL(page.url()).pathname), '/e2e.inbox@example.com')

      // Verify all three fixture messages render in the inbox list.
      await page.locator('.message-row').first().waitFor()
      assert.equal(await page.locator('.message-row').count(), 3)

      // Open the verification-code message and verify extracted code + sandboxed HTML body.
      await page.locator('.message-row').filter({ hasText: 'Verify your login' }).click()
      const codeBanner = page.locator('.verification-code')
      await codeBanner.waitFor()
      assert.match(await codeBanner.innerText(), /849\s*201/)

      const sandboxFrame = page.frameLocator('iframe[src^="/message-sandbox"]')
      await sandboxFrame.locator('strong').waitFor()
      assert.equal(await sandboxFrame.locator('strong').innerText(), '849201')

      // Delete the message (confirming the browser dialog) and verify removal persists after reload.
      page.once('dialog', (dialog) => {
        void dialog.accept()
      })
      await page.locator('[data-action="delete"]').click()
      await page.locator('.message-row').filter({ hasText: 'Verify your login' }).waitFor({ state: 'detached' })
      assert.equal(await page.locator('.message-row').count(), 2)

      await page.reload()
      await page.locator('.inbox-view').waitFor()
      await page.locator('.message-row').first().waitFor()
      assert.equal(await page.locator('.message-row').count(), 2)
      assert.equal(await page.locator('.message-row').filter({ hasText: 'Verify your login' }).count(), 0)

      assert.deepEqual(pageErrors, [])
    } finally {
      await context.close()
    }
  })

  it('validates quick-access mode and normalizes uppercase/padded addresses', async () => {
    const { context, page, pageErrors } = await env.newIsolatedPage()
    try {
      await page.goto(`${env.baseUrl}/`)
      await page.locator('.mode-switch [data-mode="existing"]').click()

      await page.locator('#quick-email').fill('not-a-valid-email')
      await page.locator('.quick-access button[type="submit"]').click()
      assert.equal(
        await page.locator('#quick-email').evaluate((el) => el.validity.typeMismatch),
        true,
      )
      assert.equal(new URL(page.url()).pathname, '/')

      await page.locator('#quick-email').fill('  QUICK.USER@EXAMPLE.COM  ')
      await page.locator('#quick-email').press('Enter')
      await page.locator('.inbox-view').waitFor()
      assert.equal(decodeURIComponent(new URL(page.url()).pathname), '/quick.user@example.com')

      assert.deepEqual(pageErrors, [])
    } finally {
      await context.close()
    }
  })
})
