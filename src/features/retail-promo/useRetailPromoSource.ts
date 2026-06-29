import { useState, useCallback } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { DataSourceRef, MergeColumn, MergeRow } from '@/stores/merge.store'
import { loadPimMergeData, makePimSourceRef } from '@/features/merge/pimSource'
import { ENRICHMENT_ALIASES } from '@/features/excel/ai-enrichment/useSaveEnrichedProduct'
import type { ExcelSheet } from '@/features/excel/types'

interface SourceResult {
  sourceRef: DataSourceRef
  columns: MergeColumn[]
  rows: MergeRow[]
}

export function useRetailPromoSource() {
  const [isLoading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const connectPim = useCallback(async (projectId: string, name: string): Promise<SourceResult> => {
    setLoading(true)
    setError(null)
    try {
      const { columns, rows } = await loadPimMergeData(projectId)
      const sourceRef = makePimSourceRef(projectId, name)
      return { sourceRef, columns, rows }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const connectExcel = useCallback(async (
    excelDocId: string,
    sheetIndex: number,
    fileName: string,
  ): Promise<SourceResult> => {
    setLoading(true)
    setError(null)
    try {
      const metaSnap = await getDoc(doc(db, 'excel_data', excelDocId))
      if (!metaSnap.exists()) throw new Error('Dataset introuvable')
      const meta = metaSnap.data()
      let sheets: ExcelSheet[]
      if (typeof meta.sheets === 'string') {
        sheets = JSON.parse(meta.sheets) as ExcelSheet[]
      } else {
        const payloadSnap = await getDoc(doc(db, 'excel_data_payload', excelDocId))
        if (!payloadSnap.exists()) throw new Error('Dataset vide ou corrompu')
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
      const sourceRef: DataSourceRef = { excelDocId, sheetIndex, fileName }
      return { sourceRef, columns, rows }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const setManual = useCallback((
    products: Array<{ name: string; newPrice?: string; oldPrice?: string; image?: string }>,
  ): SourceResult => {
    const columns: MergeColumn[] = [
      { key: 'name', label: 'Nom produit', fieldType: 'text' },
      { key: 'newPrice', label: 'Prix promo', fieldType: 'text' },
      { key: 'oldPrice', label: 'Prix barré', fieldType: 'text' },
      { key: 'image', label: 'Image', fieldType: 'image' },
    ]
    const rows: MergeRow[] = products.map((p, i) => ({
      _id: `manual_${i}`,
      name: p.name,
      newPrice: p.newPrice ?? '',
      oldPrice: p.oldPrice ?? '',
      image: p.image ?? '',
    }))
    const sourceRef: DataSourceRef = {
      excelDocId: `manual_${Date.now()}`,
      sheetIndex: 0,
      fileName: 'Saisie manuelle',
    }
    return { sourceRef, columns, rows }
  }, [])

  return { isLoading, error, connectPim, connectExcel, setManual }
}
