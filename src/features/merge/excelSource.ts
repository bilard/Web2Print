// Source Excel legacy (`excel_data` + `excel_data_payload`) pour le moteur de merge.
// Miroir de pimSource.ts pour les datasets Excel historiques (module Données) :
// utilisé par la promo retail ET le catalogue studio pour éviter deux implémentations
// du même fetch (meta inline vs payload séparé selon la taille du dataset).
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { DataSourceRef, MergeColumn, MergeRow } from '@/stores/merge.store'
import { ENRICHMENT_ALIASES } from '@/features/excel/ai-enrichment/useSaveEnrichedProduct'
import type { ExcelSheet } from '@/features/excel/types'
import { t } from '@/lib/i18n'

export interface SavedDataset { docId: string; fileName: string; totalRows: number }

/** Datasets Excel legacy de l'utilisateur (pour le picker de source). */
export async function listExcelDatasets(uid: string): Promise<SavedDataset[]> {
  const snap = await getDocs(query(collection(db, 'excel_data'), where('userId', '==', uid)))
  return snap.docs
    .map((d) => {
      const data = d.data() as { fileName?: string; totalRows?: number }
      return { docId: d.id, fileName: data.fileName ?? d.id, totalRows: data.totalRows ?? 0 }
    })
    .sort((a, b) => a.fileName.localeCompare(b.fileName))
}

/**
 * Charge une feuille d'un dataset Excel legacy et la convertit en données de merge.
 * Le doc `excel_data` porte soit les feuilles inline (`sheets` en JSON string), soit
 * un pointeur vers `excel_data_payload` (gros datasets).
 */
export async function loadExcelMergeData(
  excelDocId: string,
  sheetIndex: number,
): Promise<{ columns: MergeColumn[]; rows: MergeRow[] }> {
  const metaSnap = await getDoc(doc(db, 'excel_data', excelDocId))
  if (!metaSnap.exists()) throw new Error(t('err.notFound.dataset'))
  const meta = metaSnap.data()
  let sheets: ExcelSheet[]
  if (typeof meta.sheets === 'string') {
    sheets = JSON.parse(meta.sheets) as ExcelSheet[]
  } else {
    const payloadSnap = await getDoc(doc(db, 'excel_data_payload', excelDocId))
    if (!payloadSnap.exists()) throw new Error(t('err.notFound.datasetEmpty'))
    sheets = JSON.parse((payloadSnap.data() as { json: string }).json) as ExcelSheet[]
  }
  const sheet = sheets[sheetIndex] ?? sheets[0]
  const columns: MergeColumn[] = sheet.columns.map((c) => ({
    key: c.key,
    label: c.label,
    fieldType: c.fieldType,
    aliases: ENRICHMENT_ALIASES[c.key],
  }))
  const rows: MergeRow[] = sheet.rows.map((r) => ({ ...r }))
  return { columns, rows }
}

export function makeExcelSourceRef(excelDocId: string, sheetIndex: number, fileName: string): DataSourceRef {
  return { excelDocId, sheetIndex, fileName }
}
