// functions/src/priceWatch/catalog/store.ts
// Persistance de l'index catalogue concurrent — jumeau SERVEUR de
// src/features/priceWatch/catalog/store.ts. Même MODÈLE de documents (un doc méta +
// curseur par concurrent, un doc par page liste moissonnée) : la moisson serveur
// (cron) et la comparaison client relisent donc le MÊME index. Seule différence :
// admin SDK (firebase-admin) au lieu du SDK web.
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { competitorDoc, competitorPagesCol } from '../paths'
import type { CompetitorListing } from './prestashop'
import type { HarvestCursor } from './harvest'

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
  productCount?: number
  pageCount?: number
  lastHarvestMs?: number
  cumulHarvestMs?: number
  harvestProgress?: number
  harvestSweeps?: number
  updatedAt?: number
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
  await getFirestore().doc(competitorDoc(uid, watchId, siteId)).set(
    stripUndefined({ ...meta, updatedAt: FieldValue.serverTimestamp() }),
    { merge: true },
  )
}

/** Enregistre les produits d'UNE page liste (doc réécrit → refresh sans doublon). */
export async function savePage(
  uid: string, watchId: string, siteId: string,
  pageDocId: string, url: string, page: number, products: CompetitorListing[],
): Promise<void> {
  await getFirestore().collection(competitorPagesCol(uid, watchId, siteId)).doc(pageDocId).set(
    stripUndefined({ url, page, products, harvestedAt: FieldValue.serverTimestamp() }),
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
  return out
}

/** Nombre de pages moissonnées pour un concurrent (pour la méta / l'affichage). */
export async function countPages(uid: string, watchId: string, siteId: string): Promise<number> {
  const snap = await getFirestore().collection(competitorPagesCol(uid, watchId, siteId)).get()
  return snap.size
}
