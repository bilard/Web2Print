// src/features/analytics/uidBridge.ts
// Expose l'uid Firebase au beacon vanilla (public/analytics-beacon.js).
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase/config'

declare global {
  interface Window {
    __w2pAnalyticsUid?: string | null
  }
}

export function initAnalyticsUidBridge(): void {
  onAuthStateChanged(auth, (user) => {
    window.__w2pAnalyticsUid = user?.uid ?? null
  })
}
