import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    pool: 'threads',
    isolate: false,
    maxWorkers: 2,
    minWorkers: 1,
    forceExit: true,
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
    server: {
      deps: {
        inline: [/@testing-library\/react/, /@testing-library\/dom/, /@testing-library\/jest-dom/],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/utils/**', 'src/hooks/**'],
      exclude: ['src/test/**', '**/*.test.*'],
      thresholds: {
        statements: 40,
        branches: 40,
        functions: 40,
        lines: 40,
      },
    },
  },
})
