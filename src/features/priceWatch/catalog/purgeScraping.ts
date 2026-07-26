// Purge SÉLECTIVE des données de scraping d'un suivi, par site × par type de donnée.
// Alimente le popup « Vider les données de scraping » (node Sites sources). Destructif.
// Adaptateur Firestore fin : aucun état métier, juste des suppressions ciblées.
import { doc, collection, getDocs, deleteDoc, setDoc, deleteField, query, limit, writeBatch } from 'firebase/firestore'
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

/** Avancement live de la purge (affiché dans le popup pendant l'opération). */
export interface PurgeProgress {
  /** Site en cours (index 1-based) et total. */
  siteIndex: number
  siteCount: number
  /** Identifiant du site en cours. */
  siteId: string
  /** Fiches supprimées cumulées (tous sites), mis à jour lot par lot. */
  pagesDeleted: number
}

/** Taille des lots (writeBatch plafonne à 500) : 1 aller-retour Firestore par lot. */
const DELETE_BATCH = 400

/**
 * Vide les données de scraping choisies. `siteIds` = sites concernés (par
 * `listings`/`counters`/`cursors`) ; `report` est au niveau SUIVI (indépendant des sites).
 * Idempotent (les `catch` avalent les docs déjà absents). DESTRUCTIF, irréversible.
 */
export async function purgeScrapingData(
  uid: string, watchId: string, siteIds: string[], types: Set<ScrapeDataType>,
  onProgress?: (p: PurgeProgress) => void,
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
  for (const [i, siteId] of siteIds.entries()) {
    onProgress?.({ siteIndex: i + 1, siteCount: siteIds.length, siteId, pagesDeleted })
    if (types.has('listings')) {
      // Paginé : on lit puis supprime lot par lot (writeBatch = 1 aller-retour), sans
      // jamais charger l'index entier — sur des milliers de fiches, deleteDoc un à un
      // faisait tourner le spinner sans fin.
      for (;;) {
        const pages = await getDocs(query(collection(db, competitorPagesCol(uid, watchId, siteId)), limit(DELETE_BATCH)))
        if (pages.empty) break
        const batch = writeBatch(db)
        pages.docs.forEach((d) => batch.delete(d.ref))
        await batch.commit()
        pagesDeleted += pages.size
        onProgress?.({ siteIndex: i + 1, siteCount: siteIds.length, siteId, pagesDeleted })
        if (pages.size < DELETE_BATCH) break
      }
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
