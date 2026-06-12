import { defineConfig } from '@playwright/test'

/**
 * Harnais E2E : émulateurs Firebase (auth/firestore/storage — les règles
 * firestore.rules réelles sont chargées, RBAC inclus) + Vite en mode émulé
 * (VITE_USE_EMULATORS=1, cf. src/lib/firebase/emulators.ts). Aucune donnée
 * de prod n'est touchée. Lancer : `npm run test:e2e`.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  // Les scénarios partagent l'état de l'émulateur (compte owner) : sériel.
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5180',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'bash scripts/e2e-emulators.sh',
      url: 'http://127.0.0.1:9099',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      // --host 127.0.0.1 : sans lui Vite n'écoute qu'en IPv6 (::1) sur macOS
      // et la sonde Playwright (127.0.0.1) ne le voit jamais démarrer.
      command: 'VITE_USE_EMULATORS=1 npx vite --port 5180 --strictPort --host 127.0.0.1',
      url: 'http://127.0.0.1:5180',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
})
