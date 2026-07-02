import { useState, useCallback } from 'react'
import type { DataSourceRef, MergeColumn, MergeRow } from '@/stores/merge.store'
import { loadPimMergeData, makePimSourceRef } from '@/features/merge/pimSource'
import { loadExcelMergeData, makeExcelSourceRef } from '@/features/merge/excelSource'

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
      const { columns, rows } = await loadExcelMergeData(excelDocId, sheetIndex)
      const sourceRef = makeExcelSourceRef(excelDocId, sheetIndex, fileName)
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
