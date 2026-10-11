import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { access, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import test from 'node:test'

test('failed password claim exits through cleanup', { timeout: 60000 }, async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const source = await readFile(new URL('./mailbox-password-smoke.mjs', import.meta.url), 'utf8')
  // Inject the regression into an in-memory copy; keep the real API and runner cleanup.
  const injected = source
    .replace("const root = fileURLToPath(new URL('../../', import.meta.url))", `const root = ${JSON.stringify(root)}`)
    .replace("from 'playwright'", `from ${JSON.stringify(import.meta.resolve('playwright'))}`)
    .replace("runDir = await mkdtemp(join(tmpdir(), 'tmail-password-'))", "$&\n  console.log(`Failure fixture state=${runDir}`)")
    .replace('const response = await route.fetch()', "const response = await route.fetch({ postData: JSON.stringify({ ...route.request().postDataJSON(), password: 'short' }) })")
  assert.notEqual(injected, source)
  const child = spawn(process.execPath, ['--input-type=module'], {
    detached: true, stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, DEBUG: 'pw:browser' },
  })
  let output = ''
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => { output += chunk })
  const exited = once(child, 'close')
  child.stdin.end(injected)
  async function stopOwnedGroup(pid) {
    if (!pid) return
    for (const signal of ['SIGTERM', 'SIGKILL']) {
      try { process.kill(-pid, signal) } catch (error) {
        if (error.code === 'ESRCH') return
        throw error
      }
      if (signal === 'SIGTERM') await delay(1000)
    }
  }
  const timer = setTimeout(() => { void stopOwnedGroup(child.pid).catch(console.error) }, 45000)
  try {
    const [code, signal] = await exited
    assert.equal(signal, null, output)
    assert.equal(code, 1, output)
    assert.match(output, /FAIL mailbox password browser smoke: Password claim failed/)
    const fixturePid = Number(output.match(/Owned fixture PID=(\d+)/)?.[1])
    const browserPid = Number(output.match(/<launched> pid=(\d+)/)?.[1])
    assert(fixturePid && browserPid, output)
    for (const pid of [fixturePid, browserPid]) {
      assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' }, `Owned process ${pid} survived runner exit`)
    }
    const runDir = output.match(/Failure fixture state=(.+)/)?.[1]
    assert(runDir, output)
    await assert.rejects(access(runDir), { code: 'ENOENT' })
    const probe = createServer()
    try {
      await new Promise((resolve, reject) => {
        probe.once('error', reject)
        probe.listen(8099, '127.0.0.1', resolve)
      })
    } finally {
      if (probe.listening) await new Promise((resolve) => probe.close(resolve))
    }
  } finally {
    clearTimeout(timer)
    // Also contain resource leaks when this regression check runs against broken code.
    await stopOwnedGroup(child.pid)
    await stopOwnedGroup(Number(output.match(/<launched> pid=(\d+)/)?.[1]))
    const runDir = output.match(/Failure fixture state=(.+)/)?.[1]
    if (runDir) await rm(runDir, { recursive: true, force: true })
  }
})
