// src/features/priceWatch/catalog/purgeScraping.ts
// Purge SÉLECTIVE des données de scraping d'un suivi, par site × par type de donnée.
// Alimente le popup « Vider les données de scraping » (node Sites sources). Destructif.
// Adaptateur Firestore fin : aucun état métier, juste des suppressions ciblées.
import { doc, collection, getDocs, deleteDoc, setDoc, deleteField } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { competitorDoc, competitorPagesCol, reportLatestDoc, reportHistoryDoc } from '../paths'

/** Types de données purgeables (cases du popup). */
export type ScrapeDataType = 'listings' | 'counters' | 'cursors' | 'report'

/** Champs « compteurs & stats » du doc méta concurrent (tout ce qu'affiche le tableau). */
const COUNTER_FIELDS = [
  'productCount', 'pageCount', 'pctPrice', 'lastHarvestMs', 'cumulHarvestMs',
  'harvestSweeps', 'harvestProgress', 'lastPassPages', 'lastPassProducts', 'lastPassAt',
  'lastEngine', 'updatedAt',
] as const

/** Docs curseurs de la recherche dirigée (niveau suivi, pas par site). */
const DIRECTED_CURSORS = ['directed_cursor', 'directed_auth_cursor']

export interface PurgeResult {
  /** Nombre de pages (fiches collectées) supprimées. */
  pagesDeleted: number
  /** Nombre de sites traités. */
  sites: number
}

/**
 * Vide les données de scraping choisies. `siteIds` = sites concernés (par
 * `listings`/`counters`/`cursors`) ; `report` est au niveau SUIVI (indépendant des sites).
 * Idempotent (les `catch` avalent les docs déjà absents). DESTRUCTIF, irréversible.
 */
export async function purgeScrapingData(
  uid: string, watchId: string, siteIds: string[], types: Set<ScrapeDataType>,
): Promise<PurgeResult> {
  // Rapport dashboard : niveau suivi.
  if (types.has('report')) {
    await Promise.all([
      deleteDoc(doc(db, reportLatestDoc(uid, watchId))).catch(() => {}),
      deleteDoc(doc(db, reportHistoryDoc(uid, watchId))).catch(() => {}),
    ])
  }
  // Curseurs de la recherche dirigée : niveau suivi.
  if (types.has('cursors')) {
    await Promise.all(DIRECTED_CURSORS.map((id) =>
      deleteDoc(doc(db, competitorDoc(uid, watchId, id))).catch(() => {})))
  }

  // Tout coché pour un site → on supprime le doc méta ENTIER (table rase propre) plutôt
  // que de laisser un doc aux champs effacés un à un.
  const wipeMeta = types.has('counters') && types.has('cursors')
  let pagesDeleted = 0
  for (const siteId of siteIds) {
    if (types.has('listings')) {
      const pages = await getDocs(collection(db, competitorPagesCol(uid, watchId, siteId)))
      await Promise.all(pages.docs.map((d) => deleteDoc(d.ref)))
      pagesDeleted += pages.size
    }
    if (wipeMeta) {
      await deleteDoc(doc(db, competitorDoc(uid, watchId, siteId))).catch(() => {})
    } else if (types.has('counters') || types.has('cursors')) {
      const patch: Record<string, unknown> = {}
      if (types.has('counters')) for (const f of COUNTER_FIELDS) patch[f] = deleteField()
      if (types.has('cursors')) patch.cursor = deleteField()
      await setDoc(doc(db, competitorDoc(uid, watchId, siteId)), patch, { merge: true }).catch(() => {})
    }
  }
  return { pagesDeleted, sites: siteIds.length }
}
