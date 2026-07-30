// Écrit UNE cellule dans la SOURCE partagée (dataset Excel legacy ou projet PIM) :
// tous les canaux qui relisent la source (Catalogue studio, promo, exports…)
// voient la nouvelle valeur. Excel = read-modify-write du JSON de feuilles
// (une seule cellule changée, structure intégralement préservée) ; PIM = merge
// du champ sur le document produit.
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { DataSourceRef } from '@/stores/merge.store'
import { isPimSource, pimProjectIdFromSource } from './pimSource'
import { t } from '@/lib/i18n'

interface ExcelSheetLike {
  columns: unknown[]
  rows: Record<string, unknown>[]
}

async function updateExcelCell(excelDocId: string, sheetIndex: number, rowId: string, colKey: string, value: string): Promise<void> {
  const metaRef = doc(db, 'excel_data', excelDocId)
  const metaSnap = await getDoc(metaRef)
  if (!metaSnap.exists()) throw new Error(t('err.mg.sourceDataset'))
  const meta = metaSnap.data()
  const inMeta = typeof meta.sheets === 'string'
  const payloadRef = doc(db, 'excel_data_payload', excelDocId)
  let sheets: ExcelSheetLike[]
  if (inMeta) {
    sheets = JSON.parse(meta.sheets as string) as ExcelSheetLike[]
  } else {
    const payloadSnap = await getDoc(payloadRef)
    if (!payloadSnap.exists()) throw new Error(t('err.mg.sourceDatasetEmpty'))
    sheets = JSON.parse((payloadSnap.data() as { json: string }).json) as ExcelSheetLike[]
  }
  const sheet = sheets[sheetIndex] ?? sheets[0]
  const row = sheet?.rows.find((r) => r._id === rowId)
  if (!row) throw new Error(t('err.mg.sourceRow'))
  row[colKey] = value
  const json = JSON.stringify(sheets)
  if (inMeta) await updateDoc(metaRef, { sheets: json })
  else await updateDoc(payloadRef, { json })
}

/** Écrit `value` dans la cellule (rowId, colKey) de la source référencée. */
export async function updateSourceCell(sourceRef: DataSourceRef, rowId: string, colKey: string, value: string): Promise<void> {
  if (isPimSource(sourceRef)) {
    await setDoc(doc(db, 'pim_projects', pimProjectIdFromSource(sourceRef), 'products', rowId), { [colKey]: value }, { merge: true })
    return
  }
  if (sourceRef.excelDocId.startsWith('saved_')) {
    throw new Error(t('err.mg.noSourceLink'))
  }
  await updateExcelCell(sourceRef.excelDocId, sourceRef.sheetIndex ?? 0, rowId, colKey, value)
}
