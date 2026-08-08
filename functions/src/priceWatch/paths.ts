// functions/src/priceWatch/paths.ts
// Chemins Firestore du module Veille tarifaire — jumeau SERVEUR de
// src/features/priceWatch/paths.ts (sous-ensemble catalogue concurrent). Le code
// client/serveur n'est pas partagé : garder ces chemins IDENTIQUES au client, sinon
// la moisson serveur et la comparaison client viseraient des documents différents.
import { stableId } from './helpers'

// Point d'étranglement UNIQUE : watchId canonicalisé (stableId) pour replier casse/espaces
// — MÊME normalisation que le client (src/features/priceWatch/paths.ts). Idempotent sur
// les ids déjà propres → aucune migration des suivis existants.
const watchDoc = (uid: string, watchId: string) => `users/${uid}/priceWatch/${stableId(watchId)}`
export const DEFAULT_WATCH_ID = 'veille-1'

// --- Index catalogue concurrent (moisson par pages liste) ---
const competitorsCol = (uid: string, watchId: string) => `${watchDoc(uid, watchId)}/competitors`
export const competitorDoc = (uid: string, watchId: string, siteId: string) =>
  `${competitorsCol(uid, watchId)}/${siteId}`
export const competitorPagesCol = (uid: string, watchId: string, siteId: string) =>
  `${competitorDoc(uid, watchId, siteId)}/pages`

// --- Rapport dashboard (synthèse) — jumeau des chemins client (mêmes docs relus par l'app) ---
export const watchRootDoc = (uid: string, watchId: string) => watchDoc(uid, watchId)
export const reportLatestDoc = (uid: string, watchId: string) => `${watchDoc(uid, watchId)}/reports/latest`
export const reportHistoryDoc = (uid: string, watchId: string) => `${watchDoc(uid, watchId)}/reports/history`
export const REPORT_HISTORY_MAX = 90

// Journal des changements de prix — chemins IDENTIQUES au client (le dashboard lit ce
// que le cron écrit). Cf. src/features/priceWatch/priceEvents.ts pour le pourquoi.
export const priceStateCol = (uid: string, watchId: string) => `${watchDoc(uid, watchId)}/priceState`
export const priceEventsDoc = (uid: string, watchId: string) => `${watchDoc(uid, watchId)}/reports/priceEvents`
export const PRICE_EVENTS_MAX = 2000
export const PRICE_EVENTS_BYTES = 900_000
/** Budget d'OCTETS par tranche d'état (jamais un cap par nombre — cf. chunkState). */
export const PRICE_STATE_BYTES = 900_000

/** Règles d'appariement du suivi — jumeau du chemin client. Le cron DOIT lire le même
 *  document que le navigateur, sinon un réglage ne s'applique qu'à moitié. */
export const pairingRulesDoc = (uid: string, watchId: string) =>
  `${watchDoc(uid, watchId)}/settings/pairing`
