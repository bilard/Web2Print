import { defineConfig } from 'vitest/config'
import path from 'path'

// Config dédiée aux tests des règles Firestore (émulateur). Séparée du glob par
// défaut (src/**) pour ne pas alourdir `npm run test:run`. Voir script `test:rules`.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 15000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
