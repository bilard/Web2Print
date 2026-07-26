// Expose l'uid Firebase au beacon vanilla (public/analytics-beacon.js).
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase/config'

declare global {
  interface Window {
    __w2pAnalyticsUid?: string | null
    /** Exposé par public/analytics-beacon.js : ré-enregistre la page courante avec l'uid. */
    __w2pIdentify?: (uid: string | null) => void
  }
}

export function initAnalyticsUidBridge(): void {
  let lastUid: string | null = null
  onAuthStateChanged(auth, (user) => {
    const uid = user?.uid ?? null
    window.__w2pAnalyticsUid = uid
    // À la première connaissance de l'utilisateur (null → uid), renvoyer la page
    // courante taguée avec l'uid (l'auth se résout après le 1er beacon, sinon uid perdu).
    if (uid && uid !== lastUid) window.__w2pIdentify?.(uid)
    lastUid = uid
  })
}
