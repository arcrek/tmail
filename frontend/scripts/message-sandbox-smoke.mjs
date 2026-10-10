import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright'

const root = fileURLToPath(new URL('../../', import.meta.url))
const harness = join(root, '.claude/skills/run-tmail')
const python = process.env.PYTHON || 'python3'
const port = 8099
const baseUrl = `http://127.0.0.1:${port}`
let runDir, server, browser, cleanupPromise
let serverLog = ''

async function cleanup() {
  cleanupPromise ??= (async () => {
    try {
      await browser?.close()
    } finally {
      if (server?.pid && server.exitCode === null && server.signalCode === null) {
        const exited = once(server, 'exit')
        server.kill('SIGTERM')
        if (!await Promise.race([exited.then(() => true), delay(5000).then(() => false)])) {
          server.kill('SIGKILL')
          await exited
        }
      }
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
  runDir = await mkdtemp(join(tmpdir(), 'tmail-sandbox-'))
  const config = spawnSync(python, [join(harness, 'make_config.py'), runDir], { cwd: root, encoding: 'utf8', timeout: 10000 })
  assert.equal(config.status, 0, `Fixture config failed: ${config.error || config.stderr}`)
  server = spawn(python, [join(harness, 'fake_jmap_server.py'), runDir, '--port', String(port)], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.on('error', (error) => { serverLog += error.message })
  for (const stream of [server.stdout, server.stderr]) {
    stream.on('data', (chunk) => { serverLog = (serverLog + chunk).slice(-8000) })
  }
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
  browser = await chromium.launch({ timeout: 15000 })
  const page = await browser.newPage()
  page.setDefaultTimeout(10000)
  page.setDefaultNavigationTimeout(10000)
  const escapeUrl = `${baseUrl}/__message_sandbox_escape__`
  const hostileHtml = `<!doctype html><html><head>
    <meta http-equiv="refresh" content="0;url=${escapeUrl}">
    </head><body style="background-color: rgb(240, 240, 240)" data-test="email-body">
    <div id="probe" style="background-color: rgb(219, 234, 254)">Styled content</div>
    <script>globalThis.__tmailScriptRan = true<\/script>
    <img id="attack-image" src="data:image/png;base64,broken" onerror="globalThis.__tmailEventRan = true">
    <form id="attack-form" action="${escapeUrl}" target="_top"><button>Submit</button></form>
    <a id="safe-link" href="https://example.invalid">Example link</a>
    </body></html>`
  let delivered = false
  await page.route('**/messages/m2', async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    const response = await route.fetch()
    assert(response.ok(), 'Synthetic message detail was unavailable')
    const message = await response.json()
    await route.fulfill({ response, json: { ...message, html: [hostileHtml] } })
    delivered = true
  })
  await page.goto(`${baseUrl}/`)
  await page.locator('#local-part').fill('demo.user')
  await page.locator('button.primary-button[type="submit"]').click()
  await page.locator('.message-row').filter({ hasText: 'Invoice #4471' }).click()
  const iframe = page.locator('iframe[src^="/message-sandbox"]')
  await iframe.waitFor()
  assert.equal(await iframe.getAttribute('sandbox'), 'allow-scripts allow-popups allow-popups-to-escape-sandbox', 'Actual iframe permissions changed')
  const child = await (await iframe.elementHandle()).contentFrame()
  assert(child && child !== page.mainFrame(), 'Message must render in an embedded child frame')
  await child.locator('#probe').waitFor()
  await child.waitForFunction(() => document.getElementById('attack-image').complete)
  const checks = await child.evaluate(() => {
    function blocked(read) {
      try { read(); return false } catch (error) { return error.name === 'SecurityError' }
    }
    return {
      opaqueOrigin: globalThis.origin === 'null',
      parentDOMBlocked: blocked(() => parent.document.body),
      parentStorageBlocked: blocked(() => parent.localStorage.getItem('tmail.locale')),
      ownStorageBlocked: blocked(() => localStorage.getItem('probe')),
      inlineStyle: getComputedStyle(document.getElementById('probe')).backgroundColor === 'rgb(219, 234, 254)',
      bodyAttributePreserved: document.body.getAttribute('data-test') === 'email-body',
      scriptBlocked: typeof globalThis.__tmailScriptRan === 'undefined',
      eventHandlerBlocked: typeof globalThis.__tmailEventRan === 'undefined',
      refreshRemoved: document.querySelector('meta[http-equiv="refresh"]') === null,
      baseTargetBlank: document.querySelector('base[target="_blank"]') !== null,
      safeLink: document.getElementById('safe-link').target === '_blank' && document.getElementById('safe-link').rel === 'noopener noreferrer',
    }
  })
  assert(delivered, 'Hostile content must arrive through the real message-detail/component flow')
  for (const [boundary, passed] of Object.entries(checks)) assert(passed, `Violated boundary: ${boundary}`)
  const parentUrl = page.url()
  const childUrl = child.url()
  await child.evaluate(() => document.getElementById('attack-form').requestSubmit())
  await delay(300)
  assert.equal(page.url(), parentUrl, 'Top-level form navigation escaped the sandbox')
  assert.equal(child.url(), childUrl, 'Refresh/form navigation changed the sandbox URL')
  console.log('PASS message-sandbox browser smoke (embedded opaque-origin iframe)')
} catch (cause) {
  console.error(`FAIL message-sandbox browser smoke: ${cause instanceof Error ? cause.message : cause}`)
  process.exitCode = 1
} finally {
  await cleanup()
}
