import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = fileURLToPath(new URL('.', import.meta.url))

// Three projects: pure logic in Node, React components in jsdom, and the backend contract suite,
// which calls a real (or mock) backend and only runs through `pnpm test:contract`.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': root,
      // `server-only` throws outside a React Server environment; tests import server modules directly.
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'component',
          include: ['tests/component/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['tests/component/setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'contract',
          include: ['tests/contract/**/*.test.ts'],
          environment: 'node',
          testTimeout: 15_000,
        },
      },
    ],
  },
})
