// src/lib/firebase/emulators.ts
// Branche le SDK Firebase sur les émulateurs locaux quand VITE_USE_EMULATORS=1
// (harnais E2E Playwright — voir playwright.config.ts). Module séparé pour ne
// pas toucher config.ts (interdit) ; importé en tête de main.tsx, donc exécuté
// avant tout appel réseau Firebase.
import { connectAuthEmulator } from 'firebase/auth'
import { connectFirestoreEmulator } from 'firebase/firestore'
import { connectStorageEmulator } from 'firebase/storage'
import { auth, db, storage } from './config'

if (import.meta.env.VITE_USE_EMULATORS === '1') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectStorageEmulator(storage, '127.0.0.1', 9199)
  console.info('[emulators] Firebase branché sur les émulateurs locaux (auth/firestore/storage)')
}
