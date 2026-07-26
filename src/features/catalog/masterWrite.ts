// Sauvegarde « dans le Master » d'une fiche éditée depuis l'Aperçu du catalogue :
// écrit la correction DANS LA SOURCE (projet PIM ou dataset Excel du module
// Données) — tous les canaux qui relisent cette source la verront.
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { isPimSource, pimProjectIdFromSource } from '@/features/merge/pimSource'
import type { DataSourceRef } from '@/stores/merge.store'
import type { ExcelSheet } from '@/features/excel/types'
import type { Product, ProductField } from '@/features/pim/types'

/**
 * Applique `patch` (colonne → valeur) à la ligne `rowId` de la source.
 * - PIM : champ marqué `overridden` (le merge des sources ne l'écrasera pas).
 * - Excel legacy : la ligne est patchée DANS sa feuille, toutes les autres
 *   feuilles sont préservées (jamais de remplacement de liste).
 */
export async function saveRowToMaster(sourceRef: DataSourceRef, rowId: string, patch: Record<string, string>): Promise<void> {
  if (isPimSource(sourceRef)) {
    const ref = doc(db, 'pim_projects', pimProjectIdFromSource(sourceRef), 'products', rowId)
    const snap = await getDoc(ref)
    if (!snap.exists()) throw new Error('Produit introuvable dans le projet PIM')
    // Objet `fields` réécrit ENTIER (pas de fieldPath pointé : une clé de colonne
    // contenant « . » ou des caractères spéciaux casserait le chemin Firestore).
    const fields = { ...(snap.data() as Product).fields }
    const now = Date.now()
    for (const [k, v] of Object.entries(patch)) {
      const prev: ProductField | undefined = fields[k]
      fields[k] = { value: v, winningSourceId: prev?.winningSourceId ?? 'manual', overridden: true, updatedAt: now }
    }
    await updateDoc(ref, { fields, updatedAt: now })
    return
  }
  const metaRef = doc(db, 'excel_data', sourceRef.excelDocId)
  const metaSnap = await getDoc(metaRef)
  if (!metaSnap.exists()) throw new Error('Dataset introuvable')
  const meta = metaSnap.data() as { sheets?: unknown }
  const inline = typeof meta.sheets === 'string'
  let sheets: ExcelSheet[]
  if (inline) {
    sheets = JSON.parse(meta.sheets as string) as ExcelSheet[]
  } else {
    const payloadSnap = await getDoc(doc(db, 'excel_data_payload', sourceRef.excelDocId))
    if (!payloadSnap.exists()) throw new Error('Dataset vide ou corrompu')
    sheets = JSON.parse((payloadSnap.data() as { json: string }).json) as ExcelSheet[]
  }
  const sheet = sheets[sourceRef.sheetIndex] ?? sheets[0]
  const row = sheet?.rows.find((r) => r._id === rowId)
  if (!row) throw new Error('Ligne introuvable dans le dataset')
  Object.assign(row, patch)
  const json = JSON.stringify(sheets)
  if (inline) await updateDoc(metaRef, { sheets: json })
  else await updateDoc(doc(db, 'excel_data_payload', sourceRef.excelDocId), { json })
}
