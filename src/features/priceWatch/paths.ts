// src/features/priceWatch/paths.ts
// Chemins Firestore du module Veille tarifaire. matchKey = `${productId}__${siteId}`.
// Interne : composé par les helpers de collection ci-dessous (non exporté — cf. knip).
const watchDoc = (uid: string, watchId: string) => `users/${uid}/priceWatch/${watchId}`
export const matchesCol = (uid: string, watchId: string) => `${watchDoc(uid, watchId)}/matches`
export const historyCol = (uid: string, watchId: string) => `${watchDoc(uid, watchId)}/history`
export const matchKey = (productId: string, siteId: string) => `${productId}__${siteId}`
export const HISTORY_MAX = 30
export const DEFAULT_WATCH_ID = 'veille-1'
export const MATCH_THRESHOLD = 0.7

// --- Index catalogue concurrent (moisson par pages liste) ---
// Un doc par concurrent (méta + curseur de moisson), une sous-collection `pages`
// avec un doc par page liste moissonnée (~40 produits). Réécrire une page rafraîchit
// ses prix sans doublon. Le wildcard récursif des règles couvre déjà tout ceci.
const competitorsCol = (uid: string, watchId: string) => `${watchDoc(uid, watchId)}/competitors`
export const competitorDoc = (uid: string, watchId: string, siteId: string) =>
  `${competitorsCol(uid, watchId)}/${siteId}`
export const competitorPagesCol = (uid: string, watchId: string, siteId: string) =>
  `${competitorDoc(uid, watchId, siteId)}/pages`
