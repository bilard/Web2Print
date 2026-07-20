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
