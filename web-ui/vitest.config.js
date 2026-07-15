import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    pool: 'forks',
    isolate: false,
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
