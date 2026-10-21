import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'

// biome-ignore lint/style/noProcessEnv: It's fine.
const isRunningOnGitHub = process.env.GITHUB_ACTIONS === 'true'

export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  oxc: false,
  test: {
    environment: 'node',
    restoreMocks: true,
    include: ['src/**/*\\.test\\.ts', 'test/**/*.test.ts', 'example/**/*.test.ts'],
    globalSetup: ['./test/parity/nats.global-setup.ts'],
    setupFiles: ['./test/setup.ts'],
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reportOnFailure: true,
      include: ['src/**/*.ts'],
      exclude: ['**/*.error.ts', '**/*.module.ts', '**/*.test.ts', 'src/index.ts'],
      thresholds: {
        perFile: true,
        'src/**/*.ts': { statements: 100, branches: 100, functions: 100, lines: 100 },
      },
    },
    testTimeout: isRunningOnGitHub ? 30_000 : 15_000,
    hookTimeout: isRunningOnGitHub ? 20_000 : 10_000,
  },
})
