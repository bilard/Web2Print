//
// Charge UNIQUEMENT le schéma de colonnes d'une source de données (sans les
// lignes ni l'aperçu de fusion). Sert à peupler les listes de champs (ex. règles
// conditionnelles) même quand la fusion n'est pas activement connectée — après un
// reload, seule la référence de source (`savedDataSource`) est restaurée, pas les
// colonnes. Réplique l'extraction de colonnes de useDataMerge.connectSource.

import { getDoc, doc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { DataSourceRef, MergeColumn } from '@/stores/merge.store'
import type { ExcelSheet } from '@/features/excel/types'
import { ENRICHMENT_ALIASES } from '@/features/excel/ai-enrichment/useSaveEnrichedProduct'
import { isPimSource, pimProjectIdFromSource, loadPimMergeData } from './pimSource'

/** Colonnes (schéma) d'une source, sans charger les lignes.
 *  ⚠ AUCUNE mémoïsation : une colonne ajoutée côté Données doit apparaître
 *  immédiatement — un schéma en cache donnait des mappages fantômes. */
export async function loadColumnsOnly(source: DataSourceRef): Promise<MergeColumn[]> {
  let cols: MergeColumn[]
  if (isPimSource(source)) {
    // Le PIM n'expose pas de chargement « colonnes seules » : on réutilise le
    // chemin existant (produits bornés au projet) et on jette les lignes.
    const data = await loadPimMergeData(pimProjectIdFromSource(source))
    cols = data.columns
  } else {
    const metaSnap = await getDoc(doc(db, 'excel_data', source.excelDocId))
    if (!metaSnap.exists()) throw new Error('Dataset introuvable')
    const meta = metaSnap.data()
    let sheets: ExcelSheet[]
    if (typeof meta.sheets === 'string') {
      sheets = JSON.parse(meta.sheets)
    } else {
      const payloadSnap = await getDoc(doc(db, 'excel_data_payload', source.excelDocId))
      if (!payloadSnap.exists()) throw new Error('Dataset vide ou corrompu')
      sheets = JSON.parse(payloadSnap.data().json)
    }
    const sheet = sheets[source.sheetIndex] ?? sheets[0]
    cols = sheet.columns.map((c) => ({
      key: c.key,
      label: c.label,
      fieldType: c.fieldType,
      aliases: ENRICHMENT_ALIASES[c.key],
    }))
  }

  return cols
}
