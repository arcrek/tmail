import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

// Node 25+ enables experimental global Web Storage by default, which can shadow jsdom's
// Storage/localStorage globals; pass --no-experimental-webstorage only when supported by
// the running Node version so Node 20/22/24/25+ and Windows shells all work out of the box.
const workerExecArgv = process.allowedNodeEnvironmentFlags.has('--no-experimental-webstorage')
  ? ['--no-experimental-webstorage']
  : []

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      testTimeout: 15000,
      setupFiles: ['./src/tests/setup.ts'],
      poolOptions: {
        forks: { execArgv: workerExecArgv },
        threads: { execArgv: workerExecArgv },
      },
    },
  }),
)
