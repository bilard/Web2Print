// Résolution de la LANGUE d'un run serveur. Le catalogue de messages, lui, vit
// dans `i18nMessages.ts` — module pur, sans import, pour que le test de parité
// client↔serveur puisse le charger sans l'Admin SDK.
//
// Pourquoi tout ça existe : les logs d'un run atterrissent dans
// `users/{uid}/workflowRunsLive/{workflowId}`, que la console de l'éditeur
// affiche — quel que soit l'exécuteur. Le client et le serveur écrivent donc
// dans le MÊME panneau. Si seul le client était traduit, un workflow lancé à
// la main logerait en anglais et le même workflow lancé par le cron en
// français. C'est cette incohérence que ce module ferme.
import { getFirestore } from 'firebase-admin/firestore'
import { DEFAULT_LOCALE, isLocale, type Locale } from './i18nMessages'

export { DEFAULT_LOCALE, t, type Locale, type MessageKey } from './i18nMessages'

/** Au-delà, on n'attend plus : la langue ne vaut pas de retarder un run. */
const LOOKUP_TIMEOUT_MS = 2_000

/**
 * Langue de l'utilisateur, depuis `users/{uid}.uiSettings.locale`
 * (écrit par `useLocaleSync` côté client).
 *
 * ⚠️ Ne JAMAIS faire échouer NI RETARDER un run pour ça. Deux protections,
 * parce que la première ne suffisait pas :
 *  - `try/catch` pour les erreurs de lecture ;
 *  - une COURSE contre un délai, parce qu'une lecture Firestore peut PENDRE
 *    (Admin non initialisé, réseau) — les tests du workflow expiraient à
 *    5 s avant qu'on ne l'ajoute.
 *
 * Dans les deux cas : repli sur le français.
 */
export async function getUserLocale(uid: string): Promise<Locale> {
  const read = (async (): Promise<Locale> => {
    const snap = await getFirestore().doc(`users/${uid}`).get()
    const raw = (snap.data()?.uiSettings as { locale?: unknown } | undefined)?.locale
    return isLocale(raw) ? raw : DEFAULT_LOCALE
  })()
  const bail = new Promise<Locale>((resolve) => {
    const timer = setTimeout(() => resolve(DEFAULT_LOCALE), LOOKUP_TIMEOUT_MS)
    // Ne retient pas le process Node vivant si le run se termine avant.
    if (typeof timer.unref === 'function') timer.unref()
  })
  return Promise.race([read, bail]).catch(() => DEFAULT_LOCALE)
}
