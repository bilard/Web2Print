import {
  GoogleAuthProvider,
  getRedirectResult,
  signInWithPopup,
  signInWithRedirect,
} from 'firebase/auth'
import { auth } from '@/lib/firebase/config'
import { recordAudit } from '@/lib/auditLog'

const provider = new GoogleAuthProvider()
provider.setCustomParameters({ prompt: 'select_account' })

/** Codes d'erreur popup où basculer sur la redirection a du sens (contexte PWA
 *  standalone iOS notamment). On NE bascule PAS quand l'utilisateur ferme lui-même
 *  le popup ('auth/popup-closed-by-user' / 'auth/cancelled-popup-request'). */
const FALLBACK_CODES = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
])

/** Connexion Google robuste : popup d'abord, repli redirection si le navigateur le bloque. */
export async function signInForPulse(): Promise<void> {
  try {
    const cred = await signInWithPopup(auth, provider)
    void recordAudit({ action: 'auth.login', module: 'auth', targetLabel: cred.user.email ?? '' })
  } catch (err) {
    const code = (err as { code?: string }).code ?? ''
    if (FALLBACK_CODES.has(code)) {
      await signInWithRedirect(auth, provider)
      return
    }
    throw err
  }
}

/** À appeler au montage : finalise une éventuelle connexion par redirection en attente. */
export async function completePulseRedirect(): Promise<void> {
  try {
    const cred = await getRedirectResult(auth)
    if (cred) void recordAudit({ action: 'auth.login', module: 'auth', targetLabel: cred.user.email ?? '' })
  } catch {
    /* aucune redirection en attente, ou déjà finalisée */
  }
}
