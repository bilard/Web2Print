// src/features/priceWatch/paths.ts
// Chemins Firestore du module Veille tarifaire. matchKey = `${productId}__${siteId}`.
export const watchDoc = (uid: string, watchId: string) => `users/${uid}/priceWatch/${watchId}`
export const productsCol = (uid: string, watchId: string) => `${watchDoc(uid, watchId)}/products`
export const sitesCol = (uid: string, watchId: string) => `${watchDoc(uid, watchId)}/sites`
export const matchesCol = (uid: string, watchId: string) => `${watchDoc(uid, watchId)}/matches`
export const historyCol = (uid: string, watchId: string) => `${watchDoc(uid, watchId)}/history`
export const matchKey = (productId: string, siteId: string) => `${productId}__${siteId}`
export const HISTORY_MAX = 30
export const DEFAULT_WATCH_ID = 'veille-1'
export const MATCH_THRESHOLD = 0.7
