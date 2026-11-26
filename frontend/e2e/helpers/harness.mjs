import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { accessSync, constants } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
export const ADMIN_PASSWORD = 'admin-secret-pw'

const SERVER_SCRIPT = fileURLToPath(new URL('./e2e_server.py', import.meta.url))

function resolvePython() {
  if (process.env.PYTHON) {
    return process.env.PYTHON.includes('/') ? resolve(process.env.PYTHON) : process.env.PYTHON
  }
  const venvPython = join(REPO_ROOT, '.venv', 'bin', 'python')
  try {
    accessSync(venvPython, constants.X_OK)
    return venvPython
  } catch {
    return 'python3'
  }
}

async function allocateLoopbackPort() {
  const probe = createServer()
  try {
    await new Promise((res, rej) => {
      probe.once('error', rej)
      probe.listen(0, '127.0.0.1', res)
    })
    const address = probe.address()
    assert(address && typeof address === 'object', 'Failed to allocate loopback port')
    return address.port
  } finally {
    if (probe.listening) await new Promise((res) => probe.close(res))
  }
}

/**
 * Starts an isolated fake-JMAP FastAPI server serving `frontend/dist` and a
 * headless Chromium browser. Call `env.close()` in `after()` to guarantee
 * process, browser, and temp directory cleanup.
 */
export async function startE2EEnvironment({ adminPassword = ADMIN_PASSWORD } = {}) {
  const distIndex = join(REPO_ROOT, 'frontend', 'dist', 'index.html')
  try {
    accessSync(distIndex, constants.R_OK)
  } catch {
    throw new Error(`Missing built frontend at ${distIndex}. Run "npm run build" in frontend/ first.`)
  }

  const port = await allocateLoopbackPort()
  const baseUrl = `http://127.0.0.1:${port}`
  const runDir = await mkdtemp(join(tmpdir(), 'tmail-e2e-'))
  const python = resolvePython()

  let serverLog = ''
  let spawnError = null
  const server = spawn(
    python,
    [SERVER_SCRIPT, runDir, '--port', String(port), '--admin-password', adminPassword],
    {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  server.on('error', (error) => {
    spawnError = error
    serverLog += error.message
  })
  for (const stream of [server.stdout, server.stderr]) {
    stream.on('data', (chunk) => {
      serverLog = (serverLog + chunk).slice(-8000)
    })
  }

  let browser
  let closePromise

  const signalHandlers = new Map()
  function detachSignals() {
    for (const [signal, handler] of signalHandlers) {
      process.off(signal, handler)
    }
    signalHandlers.clear()
  }

  async function close() {
    closePromise ??= (async () => {
      detachSignals()
      try {
        await browser?.close()
      } finally {
        try {
          if (server.pid && server.exitCode === null && server.signalCode === null) {
            const exited = once(server, 'exit').catch(() => {})
            server.kill('SIGTERM')
            const stopped = await Promise.race([
              exited.then(() => true),
              delay(5000, false, { ref: false }),
            ])
            if (!stopped && server.exitCode === null && server.signalCode === null) {
              server.kill('SIGKILL')
              await exited
            }
          }
        } finally {
          await rm(runDir, { recursive: true, force: true })
        }
      }
    })()
    return closePromise
  }

  for (const signal of ['SIGINT', 'SIGTERM']) {
    const handler = () => {
      void close().finally(() => process.exit(signal === 'SIGINT' ? 130 : 143))
    }
    signalHandlers.set(signal, handler)
    process.once(signal, handler)
  }

  try {
    const deadline = Date.now() + 15000
    let ready = false
    while (Date.now() < deadline) {
      if (spawnError) {
        throw new Error(`Failed to spawn E2E server (${python}): ${spawnError.message}`)
      }
      assert(server.exitCode === null && server.signalCode === null, `E2E server exited early: ${serverLog}`)
      try {
        const response = await fetch(`${baseUrl}/site`, { signal: AbortSignal.timeout(1000) })
        ready = response.ok
        await response.body?.cancel()
      } catch {
        // Server is still booting.
      }
      if (ready) break
      await delay(100)
    }
    assert(ready, `E2E server readiness timed out on ${baseUrl}: ${serverLog}`)

    browser = await chromium.launch({ timeout: 15000 })
  } catch (error) {
    await close()
    throw error
  }

  async function newIsolatedPage(options = {}) {
    const context = await browser.newContext(options)
    const page = await context.newPage()
    page.setDefaultTimeout(10000)
    page.setDefaultNavigationTimeout(10000)
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    return { context, page, pageErrors }
  }

  return {
    baseUrl,
    port,
    runDir,
    browser,
    newIsolatedPage,
    close,
  }
}
