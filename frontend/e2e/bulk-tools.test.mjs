import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { startE2EEnvironment } from './helpers/harness.mjs'

describe('Bulk tools E2E journey', () => {
  let env

  before(async () => {
    env = await startE2EEnvironment()
  })

  after(async () => {
    await env?.close()
  })

  it('generates a batch of unique addresses and resolves verification codes in Bulk Code view', async () => {
    const { context, page, pageErrors } = await env.newIsolatedPage()
    try {
      await page.goto(`${env.baseUrl}/`)

      // Navigate to Bulk Generate and generate 3 addresses.
      await page.locator('.bulk-link').click()
      await page.locator('#bulk-count').waitFor()
      await page.locator('#bulk-count').fill('3')
      await page.locator('.bulk-controls button[type="submit"]').click()

      const generatedCells = page.locator('.saved-address')
      await generatedCells.first().waitFor()
      const addresses = await generatedCells.allInnerTexts()
      assert.equal(addresses.length, 3)
      assert.equal(new Set(addresses).size, 3, 'Generated addresses should be unique')
      for (const addr of addresses) {
        assert.match(addr, /^[^@\s]+@example\.com$/)
      }

      // Navigate to Bulk Code and inspect two of the generated addresses.
      await page.locator('.bulk-code-link').click()
      await page.locator('#bulk-code-addresses').waitFor()
      await page.locator('#bulk-code-addresses').fill(`${addresses[0]}\n${addresses[1]}`)
      await page.locator('.bulk-controls button[type="submit"]').click()

      // Wait until both rows resolve with the verification code from message m3.
      await page.waitForFunction(() => {
        const grid = document.querySelector('[role="grid"]')
        if (!grid) return false
        const text = grid.textContent || ''
        const matches = text.match(/849\s*201/g)
        return Boolean(matches && matches.length >= 2)
      })

      const gridText = await page.locator('[role="grid"]').innerText()
      assert(gridText.includes(addresses[0]), 'First address missing from Bulk Code grid')
      assert(gridText.includes(addresses[1]), 'Second address missing from Bulk Code grid')
      assert(gridText.includes('Verify your login'), 'Latest subject missing from Bulk Code grid')

      assert.deepEqual(pageErrors, [])
    } finally {
      await context.close()
    }
  })
})
