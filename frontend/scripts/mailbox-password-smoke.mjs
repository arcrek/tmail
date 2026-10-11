import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright'

const root = fileURLToPath(new URL('../../', import.meta.url))
const harness = join(root, '.claude/skills/run-tmail')
const python = process.env.PYTHON?.includes('/') ? resolve(process.env.PYTHON) : process.env.PYTHON || 'python3'
const port = 8099
const baseUrl = `http://127.0.0.1:${port}`
let runDir, server, browser, cleanupPromise
let serverLog = ''

async function stopServer() {
  if (server?.pid && server.exitCode === null && server.signalCode === null) {
    const exited = once(server, 'exit')
    server.kill('SIGTERM')
    if (!await Promise.race([exited.then(() => true), delay(5000).then(() => false)])) {
      server.kill('SIGKILL')
      await exited
    }
  }
}

async function startServer() {
  // Only external JMAP is fake; the clock is controlled inside disposable fixture state.
  const fixture = `
import sys
from pathlib import Path
from datetime import datetime, timezone
sys.path.insert(0, sys.argv[1])
from fake_jmap_server import create_app, build_fake_jmap
import uvicorn
run_dir = Path(sys.argv[2])
app = create_app(str(run_dir / "config.json"))
app.state.jmap = build_fake_jmap()
def clock():
    path = run_dir / "clock.txt"
    return datetime.fromisoformat(path.read_text()) if path.exists() else datetime.now(timezone.utc)
app.state.state_store.clock = clock
uvicorn.run(app, host="127.0.0.1", port=int(sys.argv[3]), log_level="warning")
`
  serverLog = ''
  server = spawn(python, ['-c', fixture, harness, runDir, String(port)], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.on('error', (error) => { serverLog += error.message })
  for (const stream of [server.stdout, server.stderr]) {
    stream.on('data', (chunk) => { serverLog = (serverLog + chunk).slice(-8000) })
  }
  console.log(`Owned fixture PID=${server.pid} port=${port} cwd=${root}; command=${python} -c fixture`)
  const deadline = Date.now() + 15000
  let ready = false
  while (Date.now() < deadline) {
    assert(server.exitCode === null && server.signalCode === null, `Fixture exited: ${serverLog}`)
    try {
      const response = await fetch(`${baseUrl}/site`, { signal: AbortSignal.timeout(1000) })
      ready = response.ok
      await response.body?.cancel()
    } catch { /* The owned fixture may still be starting. */ }
    if (ready) break
    await delay(100)
  }
  assert(ready, `Fixture readiness timed out: ${serverLog}`)
}

async function cleanup() {
  cleanupPromise ??= (async () => {
    try {
      await browser?.close()
    } finally {
      await stopServer()
      if (runDir) await rm(runDir, { recursive: true, force: true })
    }
  })()
  return cleanupPromise
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    void cleanup().finally(() => process.exit(signal === 'SIGINT' ? 130 : 143))
  })
}

try {
  // Fail on an occupied port without touching its owner or choosing another port.
  const probe = createServer()
  try {
    await new Promise((resolve, reject) => {
      probe.once('error', reject)
      probe.listen(port, '127.0.0.1', resolve)
    })
  } finally {
    if (probe.listening) await new Promise((resolve) => probe.close(resolve))
  }
  runDir = await mkdtemp(join(tmpdir(), 'tmail-password-'))
  const config = spawnSync(python, [join(harness, 'make_config.py'), runDir], { cwd: root, encoding: 'utf8', timeout: 10000 })
  assert.equal(config.status, 0, `Fixture config failed: ${config.error || config.stderr}`)
  await startServer()
  const errors = []
  let mainContext, page
  async function launchBrowser(storageState) {
    browser = await chromium.launch({ timeout: 15000 })
    mainContext = await browser.newContext(storageState ? { storageState } : undefined)
    page = await mainContext.newPage()
    page.setDefaultTimeout(10000)
    page.setDefaultNavigationTimeout(10000)
    page.on('pageerror', (error) => errors.push(error.message))
  }
  await launchBrowser()
  const address = 'protected@example.com'
  const password = ' ' + '😀'.repeat(12) + ' '
  const replacement = 'replacement-password'
  const inbox = (p) => p.locator('.inbox-view')
  const login = (p) => p.locator('#mailbox-login-password')
  async function signIn(p, value) {
    await login(p).fill(value)
    await p.locator('.mailbox-login button[type="submit"]').click()
    await inbox(p).waitFor()
  }
  async function manage(p, value, current) {
    await p.locator('[data-action="password"]').click()
    await p.locator('dialog[open]').waitFor()
    if (current) await p.locator('#mailbox-current-password').fill(current)
    await p.locator('#mailbox-new-password').fill(value)
    await p.locator('#mailbox-confirm-password').fill(value)
    await p.locator('dialog button[type="submit"]').click()
    await p.locator('dialog').waitFor({ state: 'detached' })
    await inbox(p).waitFor()
  }
  async function removeProtection(p, current) {
    await p.locator('[data-action="password"]').click()
    await p.locator('dialog .secondary-button').click()
    if (current) await p.locator('#mailbox-current-password').fill(current)
    await p.locator('dialog button[type="submit"]').click()
    await p.locator('dialog').waitFor({ state: 'detached' })
    await inbox(p).waitFor()
  }
  await page.goto(`${baseUrl}/${address}`)
  await inbox(page).waitFor()
  await page.locator('.message-row').first().waitFor()
  const stale = await page.evaluate(() => localStorage.getItem('tmail.addresses'))
  await page.locator('[data-action="password"]').click()
  await page.locator('dialog[open]').waitFor()
  assert((await page.locator('dialog').innerText()).includes('After 90 days'))
  assert.equal(await page.locator('#mailbox-new-password').getAttribute('maxlength'), null)
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab')
    // Chromium may focus browser chrome after the last control (activeElement = body).
    assert(await page.evaluate(() => document.activeElement === document.body || Boolean(document.activeElement.closest('dialog'))), 'Tab focused the inert page background')
  }
  assert(await page.evaluate(() => {
    const background = document.querySelector('[data-action="password"]')
    background.focus()
    return document.activeElement !== background
  }), 'Native modal allowed background focus')
  await page.keyboard.press('Escape')
  await page.locator('dialog').waitFor({ state: 'detached' })
  assert(await page.locator('[data-action="password"]').evaluate((node) => node === document.activeElement), 'Escape did not restore focus')
  // Hold a committed mutation response while the old inbox observes revocation.
  let releaseReplacement, committed, failed
  const released = new Promise((resolve) => { releaseReplacement = resolve })
  const mutationCommitted = new Promise((resolve, reject) => { committed = resolve; failed = reject })
  await page.route('**/me/password', async (route) => {
    try {
      const response = await route.fetch()
      assert(response.ok(), 'Password claim failed')
      committed()
      await released
      await route.fulfill({ response })
    } catch (cause) {
      failed(cause)
    }
  })
  const changing = manage(page, password)
  void changing.catch(failed)
  const commitTimeout = setTimeout(() => failed(new Error('Password claim synchronization timed out')), 15000)
  try {
    await mutationCommitted
    await page.evaluate(() => document.querySelector('[data-action="refresh"]')?.click())
    await inbox(page).waitFor({ state: 'detached' })
    assert.equal(await page.locator('dialog[open]').count(), 1, 'Old bearer rejection discarded the replacement dialog')
    releaseReplacement()
    await changing
  } finally {
    clearTimeout(commitTimeout)
    releaseReplacement()
  }
  await page.unroute('**/me/password')
  assert((await page.locator('.mailbox-security').innerText()).includes('Protection expires:'))
  const saved = await page.evaluate(() => localStorage.getItem('tmail.addresses'))
  assert(!saved.includes(password))
  assert.notEqual(saved, stale)
  const storageState = await mainContext.storageState() // Keep credentials in memory only.
  await browser.close()
  await stopServer()
  await startServer()
  await launchBrowser(storageState)
  await page.goto(`${baseUrl}/${address}`)
  await inbox(page).waitFor()
  assert((await page.locator('.mailbox-security').innerText()).includes('Protection expires:'))
  const shared = await page.context().newPage()
  await shared.goto(`${baseUrl}/${address}`)
  await inbox(shared).waitFor()
  await manage(page, replacement, password)
  // The replacement visitor token is shared across tabs and validated before reuse.
  await shared.waitForFunction(() => document.querySelector('.inbox-view') && JSON.parse(localStorage.getItem('tmail.addresses'))[0].token !== '')
  assert.equal(await shared.locator('#mailbox-login-password').count(), 0)
  await shared.close()

  const visitor = await browser.newContext()
  const fresh = await visitor.newPage()
  await fresh.goto(`${baseUrl}/${address}`)
  await login(fresh).waitFor()
  await login(fresh).fill('incorrect-password')
  await fresh.locator('.mailbox-login button[type="submit"]').click()
  await fresh.waitForFunction(() => document.getElementById('mailbox-login-error').textContent.includes('incorrect'))
  assert.equal(await login(fresh).inputValue(), '')
  const loginShots = join(root, 'plans/reports/mailbox-login-ui-shots')
  await mkdir(loginShots, { recursive: true })
  for (const locale of ['en', 'vi']) {
    await fresh.setViewportSize({ width: 1440, height: 900 })
    await fresh.locator('.locale-picker select').selectOption(locale)
    for (const theme of ['light', 'dark']) {
      await fresh.evaluate((value) => { document.documentElement.dataset.theme = value }, theme)
      for (const width of [1440, 768, 375, 320]) {
        await fresh.setViewportSize({ width, height: 900 })
        assert(await fresh.locator('.mailbox-login').evaluate((card) => {
          const rect = card.getBoundingClientRect()
          const styles = getComputedStyle(card)
          const heading = card.querySelector('h1')
          const field = card.querySelector('.field').getBoundingClientRect()
          return document.documentElement.scrollWidth <= innerWidth && card.scrollWidth <= card.clientWidth + 1 &&
            rect.width <= 512 && Math.abs(rect.left + rect.right - innerWidth) <= 2 &&
            parseFloat(styles.paddingLeft) >= 16 && parseFloat(styles.paddingRight) >= 16 &&
            field.left - rect.left >= 16 && rect.right - field.right >= 16 &&
            parseFloat(getComputedStyle(heading).fontSize) <= 32 &&
            [...card.querySelectorAll('p')].every((node) => getComputedStyle(node).marginBottom === '0px') &&
            [...card.querySelectorAll('button')].every((node) => node.getBoundingClientRect().height >= 44)
        }), `Mailbox login spacing or overflow at ${locale}/${theme}/${width}`)
        await fresh.screenshot({ path: join(loginShots, `${locale}-${theme}-${width}.png`) })
      }
    }
  }
  await fresh.setViewportSize({ width: 1440, height: 900 })
  await fresh.locator('.locale-picker select').selectOption('en')
  await signIn(fresh, replacement)
  await fresh.locator('[data-action="mailbox-logout"]').click()
  await login(fresh).waitFor()
  assert.equal(await fresh.evaluate(() => localStorage.getItem('tmail.addresses')), '[]')
  await fresh.evaluate((value) => localStorage.setItem('tmail.addresses', value), stale)
  await fresh.reload()
  await login(fresh).waitFor()
  assert.equal(await fresh.locator('.message-row').count(), 0)
  assert.equal(await fresh.evaluate(() => localStorage.getItem('tmail.addresses')), '[]')
  await fresh.locator('.bulk-code-link').click()
  await fresh.locator('#bulk-code-addresses').fill(address)
  await fresh.locator('.bulk-controls button[type="submit"]').click()
  await fresh.locator('tbody a').waitFor()
  assert.equal(await fresh.locator('tbody a').getAttribute('href'), `/${encodeURIComponent(address)}`)
  await visitor.close()

  const adminContext = await browser.newContext()
  const admin = await adminContext.newPage()
  await admin.goto(`${baseUrl}/admin`)
  await admin.locator('#admin-password').fill('admin-secret-pw')
  await admin.locator('.admin-login button[type="submit"]').click()
  await admin.locator('.admin-shell').waitFor()
  await admin.goto(`${baseUrl}/${address}`)
  await inbox(admin).waitFor()
  assert((await admin.locator('.mailbox-security').innerText()).includes('Administrator access'))
  assert.equal(await admin.evaluate(() => localStorage.getItem('tmail.addresses')), null)
  await manage(admin, 'admin-reset-password')
  assert.equal(await admin.evaluate(() => localStorage.getItem('tmail.addresses')), null)
  await page.locator('[data-action="refresh"]').click()
  await login(page).waitFor()
  assert.equal(await page.locator('.message-row').count(), 0)
  await removeProtection(admin)
  assert.equal(await admin.evaluate(() => localStorage.getItem('tmail.addresses')), null)
  await admin.locator('[data-action="mailbox-logout"]').click()
  await login(admin).waitFor()
  await admin.goto(`${baseUrl}/admin`)
  await admin.locator('#admin-password').waitFor()
  assert.equal(await admin.locator('.admin-shell').count(), 0)
  await adminContext.close()

  await page.locator('.mailbox-login .text-button').click()
  await inbox(page).waitFor()
  await manage(page, replacement)
  await removeProtection(page, replacement)
  assert((await page.locator('.mailbox-security').innerText()).includes('Public mailbox'))
  await manage(page, replacement)
  await page.route('**/me/logout', (route) => route.abort('failed'))
  await page.locator('[data-action="mailbox-logout"]').click()
  await login(page).waitFor()
  await page.waitForFunction(() => document.body.textContent.includes('Server revocation could not be confirmed'))
  await page.unroute('**/me/logout')
  await signIn(page, replacement)
  const shots = join(root, 'plans/reports/mailbox-password-ui-shots')
  await mkdir(shots, { recursive: true })
  for (const locale of ['en', 'vi']) {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.locator('select[aria-label="Language"], select[aria-label="Ngôn ngữ"]').selectOption(locale)
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => { document.documentElement.dataset.theme = value }, theme)
      for (const width of [1440, 768, 375, 320]) {
        await page.setViewportSize({ width, height: width === 768 ? 1024 : width <= 375 ? 812 : 900 })
        await page.locator('[data-action="password"]').click()
        await page.locator('dialog[open]').waitFor()
        assert(await page.evaluate(() => {
          const card = document.querySelector('.mailbox-password-dialog')
          const rect = card.getBoundingClientRect()
          return document.documentElement.scrollWidth <= innerWidth && card.scrollWidth <= card.clientWidth + 1 &&
            rect.left >= 15 && rect.right <= innerWidth - 15 && rect.top >= 15 && rect.bottom <= innerHeight - 15 &&
            Math.abs(rect.left + rect.right - innerWidth) <= 2
        }), `Clipped or off-center dialog at ${locale}/${theme}/${width}`)
        assert(await page.locator('dialog button').evaluateAll((nodes) => nodes.every((node) => {
          const rect = node.getBoundingClientRect()
          return rect.width >= 44 && rect.height >= 44
        })), 'Password dialog touch target smaller than 44px')
        await page.screenshot({ path: join(shots, `${locale}-${theme}-${width}.png`), fullPage: false })
        await page.locator('dialog .text-button').focus()
        assert(await page.locator('dialog .text-button').evaluate((node) => {
          const rect = node.getBoundingClientRect()
          const card = node.closest('.mailbox-password-dialog').getBoundingClientRect()
          return node === document.activeElement && rect.top >= card.top && rect.bottom <= card.bottom
        }), 'Dialog cancel control cannot be reached within the scrollable card')
        await page.keyboard.press('Escape')
        await page.locator('dialog').waitFor({ state: 'detached' })
      }
    }
  }
  if (process.env.DISCOVERY_SCANNER) {
    const discovery = spawnSync(process.execPath, [process.env.DISCOVERY_SCANNER, baseUrl, '--json'], {
      encoding: 'utf8', timeout: 30000,
    })
    await writeFile(join(root, 'plans/reports/discovery-261010-2041-mailbox-passwords.json'), discovery.stdout)
    assert.equal(discovery.status, 0, `Discovery scanner failed: ${discovery.stderr || discovery.stdout}`)
    console.log('PASS discovery scanner')
  }
  const remembered = JSON.parse(await page.evaluate(() => localStorage.getItem('tmail.addresses')))
  const securedToken = remembered.find((item) => item.address === address).token
  const metadata = await fetch(`${baseUrl}/me`, { headers: { Authorization: `Bearer ${securedToken}` } }).then((r) => r.json())
  assert.equal(metadata.protected, true)
  // Advance the fixture clock to the exact protection deadline, without changing database rows.
  await writeFile(join(runDir, 'clock.txt'), metadata.protectedUntil)
  await page.evaluate(() => document.querySelector('[data-action="refresh"]').click())
  await login(page).waitFor()
  assert.equal(await page.locator('.message-row').count(), 0)
  assert.equal(await page.evaluate(() => localStorage.getItem('tmail.addresses')), '[]')
  await page.locator('.mailbox-login .text-button').click()
  await inbox(page).waitFor()
  await page.locator('.message-row').first().waitFor()
  assert((await page.locator('.mailbox-security').innerText()).includes('Public mailbox') ||
    (await page.locator('.mailbox-security').innerText()).includes('Hộp thư công khai'))
  const expiredToken = await fetch(`${baseUrl}/me`, { headers: { Authorization: `Bearer ${securedToken}` } })
  assert.equal(expiredToken.status, 401, 'Expired secured token regained access')
  assert.deepEqual(errors, [], 'Browser runtime errors')
  console.log('PASS mailbox password browser smoke: visitor/admin lifecycle, restart persistence, exact expiry, storage, modal keyboard, EN/VI, light/dark, 1440/768/375/320px')
} catch (cause) {
  console.error(`FAIL mailbox password browser smoke: ${cause instanceof Error ? cause.message : cause}`)
  process.exitCode = 1
} finally {
  await cleanup()
}
