// Chemins Firestore du module Veille tarifaire. matchKey = `${productId}__${siteId}`.
// Interne : composé par les helpers de collection ci-dessous (non exporté — cf. knip).
import { stableId } from './core'

// Point d'étranglement UNIQUE : tous les chemins d'un suivi passent par ici. Le watchId
// est canonicalisé (stableId) pour que « F1 Moisson », « f1 moisson », « F1  Moisson »
// pointent tous au MÊME document — sinon un même identifiant retapé avec une casse ou un
// espace différent entre les nodes « Moisson » et « Comparer » vise deux docs distincts
// (index écrit ici, relu là → vide). stableId est idempotent sur les ids déjà propres
// (« veille-moto », « f1moisson » inchangés) → aucune migration des suivis existants.
const watchDoc = (uid: string, watchId: string) => `users/${uid}/priceWatch/${stableId(watchId)}`
/** Collection des suivis d'un utilisateur (pour lister/choisir le suivi actif). */
export const priceWatchCol = (uid: string) => `users/${uid}/priceWatch`
/** Doc racine d'un suivi : méta (libellé, updatedAt, lastReportAt) pour le sélecteur. */
export const watchRootDoc = (uid: string, watchId: string) => watchDoc(uid, watchId)
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
export const competitorsCol = (uid: string, watchId: string) => `${watchDoc(uid, watchId)}/competitors`
export const competitorDoc = (uid: string, watchId: string, siteId: string) =>
  `${competitorsCol(uid, watchId)}/${siteId}`
export const competitorPagesCol = (uid: string, watchId: string, siteId: string) =>
  `${competitorDoc(uid, watchId, siteId)}/pages`

// --- Rapport de comparaison (synthèse dashboard) ---
// Le node « Comparer catalogue » pré-calcule un rapport BORNÉ (KPIs + stats/concurrent
// + liste produit rangée/plafonnée) → un doc `latest`. Un doc `history` garde un
// ring-buffer de points KPI pour la tendance. Le dashboard lit ces deux docs, jamais
// les lignes brutes de l'index (cf. mur 1 Mo/100 lignes de l'audit scalabilité).
export const reportLatestDoc = (uid: string, watchId: string) =>
  `${watchDoc(uid, watchId)}/reports/latest`
export const reportHistoryDoc = (uid: string, watchId: string) =>
  `${watchDoc(uid, watchId)}/reports/history`
/** Nombre de points KPI conservés pour la courbe de tendance. */
export const REPORT_HISTORY_MAX = 90

// --- Journal des changements de prix ---
// `priceState` (chunké) = dernier prix connu par cellule produit × concurrent ; il sert
// UNIQUEMENT de référence de diff. `priceEvents` = journal borné des mouvements, ce que
// lit le dashboard. Reconstruire l'évolution depuis les snapshots de `latest` est exclu
// (liste plafonnée → biais de survie, cf. priceEvents.ts).
export const priceStateCol = (uid: string, watchId: string) => `${watchDoc(uid, watchId)}/priceState`
export const priceEventsDoc = (uid: string, watchId: string) =>
  `${watchDoc(uid, watchId)}/reports/priceEvents`
/** Mouvements conservés dans le journal (double plafond avec PRICE_EVENTS_BYTES). */
export const PRICE_EVENTS_MAX = 2000
/** Budget d'octets du doc journal — marge sous la limite dure Firestore de 1 048 576 o. */
export const PRICE_EVENTS_BYTES = 900_000
/** Budget d'OCTETS par tranche d'état. Un cap par NOMBRE d'entrées ne protège pas :
 *  la clé est de longueur variable (stableId retombe sur le nom du produit) et Firestore
 *  refuse tout doc > 1 048 576 o. Cf. chunkState. */
export const PRICE_STATE_BYTES = 900_000

// --- Règles d'appariement ---
// Le jeu de paramètres qui pilote le moteur (clés, preuves acceptées, démentis). Il vit
// en FIRESTORE et non dans la config d'un node : ses consommateurs ne sont pas tous
// joignables par un edge de workflow — l'écran « Concurrents », la passe Kramp et les
// crons serveur liraient sinon les littéraux, et le réglage ne s'appliquerait qu'à moitié.
export const pairingRulesDoc = (uid: string, watchId: string) =>
  `${watchDoc(uid, watchId)}/settings/pairing`

// Textes réécrits (traduction, enrichissement), rangés À CÔTÉ du catalogue et jamais
// DEDANS.
//
// ⚠ Le catalogue source est réécrit en bloc à chaque « Comparer catalogue ». Y poser les
// traductions les ferait disparaître au comparatif suivant, sans un mot — et la mémoire
// de l'original avec. Une collection distincte survit aux recalculs, et l'écran superpose
// les deux à la lecture.
export const textRevisionsCol = (uid: string, watchId: string) =>
  `${watchDoc(uid, watchId)}/textRevisions`
