// functions/src/priceWatch/catalog/store.ts
// Persistance de l'index catalogue concurrent — jumeau SERVEUR de
// src/features/priceWatch/catalog/store.ts. Même MODÈLE de documents (un doc méta +
// curseur par concurrent, un doc par page liste moissonnée) : la moisson serveur
// (cron) et la comparaison client relisent donc le MÊME index. Seule différence :
// admin SDK (firebase-admin) au lieu du SDK web.
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { competitorDoc, competitorPagesCol, watchRootDoc } from '../paths'
import type { CompetitorListing } from './competitorListing'
import type { HarvestCursor } from './harvest'
import { dedupeListings } from './match'

/** Retire les `undefined` (rejetés par Firestore) en préservant null/objets/arrays. */
function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripUndefined) as unknown as T
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = stripUndefined(v)
    }
    return out as T
  }
  return value
}

export interface CompetitorMeta {
  domain: string
  cursor?: HarvestCursor
  /** Dernière mise en ATTENTE par le mode cycle (parité client) : balayage terminé, on
   *  patiente que les retardataires finissent. Comparé à `lastPassAt` pour distinguer
   *  « attend son tour » de « ne se lance plus ». */
  cycleWaitingAt?: number
  productCount?: number
  pageCount?: number
  lastHarvestMs?: number
  cumulHarvestMs?: number
  /** Battement de MOISSON : horodatage écrit UNIQUEMENT par une passe de scraping.
   *  ⚠ Ne PAS se fier à `updatedAt` pour dire « en cours » : le node « Comparer » réécrit
   *  la méta de TOUS les concurrents dans la même rafale (même milliseconde), ce qui les
   *  faisait tous passer pour actifs. */
  harvestBeatAt?: number
  harvestProgress?: number
  harvestSweeps?: number
  updatedAt?: number
  /** % de produits avec prix sur la dernière passe (chip « prix » du node Sites sources). */
  pctPrice?: number
  /** % de fiches portant une RÉFÉRENCE, mesuré au dernier « Comparer ». Décide si la passe
   *  d'enrichissement des clés doit se voir réserver du temps (cf. `refEnrichPass`). */
  pctRef?: number
  /** Compteurs CUMULÉS du balayage courant (base du pctPrice) — remis à zéro à la
   *  réouverture d'un sweep. Sans eux, le %% serait celui de la dernière passe seule. */
  sweepProducts?: number
  sweepWithPrice?: number
  /** Moteur de la dernière passe ('cloudFunction' = fetch serveur) + bilan (✓/⚠/✗). */
  lastEngine?: string
  lastPassPages?: number
  lastPassProducts?: number
  lastPassAt?: number
  /**
   * Balayages COMPLETS terminés sans une seule fiche nouvelle.
   *
   * ⚠ Sert à rendre son budget de pages à un catalogue épuisé : granit-parts.fr moissonnait
   * 1 603 fiches par run pour zéro référence de plus, en consommant la même part que les
   * sites qui découvraient encore. Remis à zéro dès qu'un balayage rapporte.
   */
  saturatedSweeps?: number
  /** Compte de fiches à la fin du balayage précédent — base de la comparaison. */
  lastSweepIndexed?: number
  /** Position de reprise de la passe d'enrichissement des clés (`refEnrichPass`). */
  refEnrichCursor?: string | null
}

/** Crée/rafraîchit le doc RACINE du suivi. À appeler dès la MOISSON : sans lui, le doc
 *  parent reste virtuel (seules les sous-collections existent) → le suivi n'apparaît pas
 *  dans la liste côté client tant que le 1ᵉʳ « Comparer catalogue » n'a pas abouti.
 *  `customLabel` (renommage manuel) reste prioritaire à l'affichage. */
export async function touchWatch(uid: string, watchId: string, label?: string): Promise<void> {
  await getFirestore().doc(watchRootDoc(uid, watchId)).set(
    { ...(label ? { label } : {}), updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  ).catch(() => {})
}

/**
 * Publie les familles du catalogue source sur le doc du suivi.
 *
 * ⚠⚠ Elles ne sont connues QUE du node « Comparer », qui lit la feuille et sait quelle
 * colonne porte la famille. Le node « Moisson », lui, ne reçoit la feuille que si son port
 * `products` est branché — et quand il ne l'est pas, il balaie le catalogue ENTIER de
 * chaque concurrent, rayons que la source ne vend pas compris. Publier la liste ici évite à
 * la moisson de recharger cent quinze mille produits pour en extraire quarante libellés.
 */
export async function saveSourceFamilies(uid: string, watchId: string, families: string[]): Promise<void> {
  await getFirestore().doc(watchRootDoc(uid, watchId)).set(
    { sourceFamilies: families.slice(0, 40) }, { merge: true },
  ).catch(() => {})
}

/** Familles du catalogue source publiées par le dernier « Comparer ». [] si jamais écrites. */
export async function loadSourceFamilies(uid: string, watchId: string): Promise<string[]> {
  const snap = await getFirestore().doc(watchRootDoc(uid, watchId)).get().catch(() => null)
  const raw = snap?.data()?.sourceFamilies
  return Array.isArray(raw) ? raw.filter((f): f is string => typeof f === 'string') : []
}

/** Lit la méta + le curseur d'un concurrent. null si jamais moissonné. */
export async function loadCompetitorMeta(
  uid: string, watchId: string, siteId: string,
): Promise<CompetitorMeta | null> {
  const snap = await getFirestore().doc(competitorDoc(uid, watchId, siteId)).get()
  return snap.exists ? (snap.data() as CompetitorMeta) : null
}

/** Écrit/fusionne la méta d'un concurrent (curseur compris). */
export async function saveCompetitorMeta(
  uid: string, watchId: string, siteId: string, meta: Partial<CompetitorMeta>,
): Promise<void> {
  // ⚠ serverTimestamp() HORS de stripUndefined : ce dernier recurse dans le sentinel
  // FieldValue et le détruit (updatedAt illisible → heartbeat live mort).
  await getFirestore().doc(competitorDoc(uid, watchId, siteId)).set(
    { ...stripUndefined(meta), updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  )
}

/** Enregistre les produits d'UNE page liste (doc réécrit → refresh sans doublon). */
export async function savePage(
  uid: string, watchId: string, siteId: string,
  pageDocId: string, url: string, page: number, products: CompetitorListing[],
): Promise<void> {
  await getFirestore().collection(competitorPagesCol(uid, watchId, siteId)).doc(pageDocId).set(
    { ...stripUndefined({ url, page, products }), harvestedAt: FieldValue.serverTimestamp() },
  )
}

interface PageDoc {
  url: string
  page: number
  products: CompetitorListing[]
}

/** Relit tous les produits indexés d'un concurrent (toutes pages confondues). */
export async function loadAllListings(
  uid: string, watchId: string, siteId: string,
): Promise<CompetitorListing[]> {
  const snap = await getFirestore().collection(competitorPagesCol(uid, watchId, siteId)).get()
  const out: CompetitorListing[] = []
  snap.forEach((d) => {
    const data = d.data() as PageDoc
    if (Array.isArray(data.products)) out.push(...data.products)
  })
  // Jumeau du client : les pages liste se recouvrent d'un balayage à l'autre (jusqu'à
  // 97 % de doublons relevés sur un site). Dédupliquer ICI aligne matching, audit et
  // compteurs sur le nombre de fiches RÉEL — et divise d'autant la mémoire du cron.
  return dedupeListings(out)
}

/**
 * Pages de l'index avec leur identifiant, dans un ordre STABLE.
 *
 * ⚠ L'ordre est celui du tri par identifiant de document, garanti par Firestore : la passe
 * d'enrichissement (`refEnrichPass`) reprend par curseur d'un tick à l'autre, et un ordre
 * qui changerait entre deux ticks lui ferait sauter des pages sans jamais le dire.
 */
export async function loadIndexPages(
  uid: string, watchId: string, siteId: string,
): Promise<{ id: string; url: string; page: number; products: CompetitorListing[] }[]> {
  const snap = await getFirestore().collection(competitorPagesCol(uid, watchId, siteId)).orderBy('__name__').get()
  return snap.docs.map((d) => {
    const data = d.data() as PageDoc
    return {
      id: d.id, url: data.url, page: data.page,
      products: Array.isArray(data.products) ? data.products : [],
    }
  })
}

/** Réécrit les produits d'une page déjà moissonnée (enrichissement des références). */
export async function saveIndexPageProducts(
  uid: string, watchId: string, siteId: string, pageId: string, products: CompetitorListing[],
): Promise<void> {
  await getFirestore().collection(competitorPagesCol(uid, watchId, siteId)).doc(pageId).set(
    { products: stripUndefined(products) }, { merge: true },
  )
}

/** Nombre de pages moissonnées pour un concurrent (pour la méta / l'affichage). */
export async function countPages(uid: string, watchId: string, siteId: string): Promise<number> {
  const snap = await getFirestore().collection(competitorPagesCol(uid, watchId, siteId)).get()
  return snap.size
}
