/**
 * Source du token Bright Data utilisé par les Cloud Functions.
 *
 * Priorité de lecture :
 *   1. Firestore : doc `config/brightdata` champ `apiToken` (saisie via l'UI
 *      Settings → Connecteurs, sans nécessiter de redéploiement)
 *   2. Firebase Secret Manager : secret `BRIGHTDATA_API_TOKEN` (configuré
 *      via `firebase functions:secrets:set`)
 *
 * La priorité Firestore permet de mettre à jour le token sans redéployer les
 * fonctions. Le secret reste comme fallback pour les setups initiaux.
 *
 * Note sécurité : Firestore est moins isolé que Secret Manager (le doc est
 * lisible par tout utilisateur authentifié selon les rules Firestore). Pour
 * une appli mono-utilisateur (Web2Print), c'est acceptable. Pour multi-user,
 * restreindre les rules ou repasser au secret uniquement.
 */

import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

if (!getApps().length) initializeApp()

export async function getBrightDataToken(secretFallback: string | undefined): Promise<string> {
  try {
    const snap = await getFirestore().doc('config/brightdata').get()
    if (snap.exists) {
      const token = snap.data()?.apiToken
      if (typeof token === 'string' && token.trim()) return token.trim()
    }
  } catch {
    // Firestore unavailable — fallback silencieux au secret
  }
  return (secretFallback ?? '').trim()
}
