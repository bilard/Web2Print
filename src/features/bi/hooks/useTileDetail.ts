// Le détail d'une tuile : ses lignes, leurs filtres, leur export.
//
// ⚠⚠ Appelé UNIQUEMENT depuis `TileDetail`, monté le tiroir ouvert. Ce hook recompose les
// lignes de la source (`useSourceRows`) : appelé dans chaque tuile « au cas où », il ferait
// une copie de la feuille active PAR TUILE, en plus de celle de `useTileData`.
import { useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { useExcelStore } from '@/stores/excel.store'
import { useTranslation, type TranslationKey } from '@/lib/i18n'
import { underlyingRows, type UnderlyingRows } from '../engine/underlyingRows'
import { getSource } from '../registry/sources'
import { effectivePimSource } from '../registry/pim.source'
import { describeFilter } from '../filters/filterOptions'
import { dimensionLabel } from '../filters/dimensionLabel'
import { exportBoardToXlsx } from '../export/exportBoard'
import { biLabel } from '../components/biLabel'
import { useSourceRows } from './useSourceRows'
import type { FilterClause, QuerySpec } from '../types'

/** Plafond de l'échantillon montré. Le décompte réel, lui, reste exact (cf. `underlyingRows`). */
const MAX_DETAIL_ROWS = 500

export interface TileDetail {
  /** `null` seulement si la source n'a rien à montrer. */
  detail: UnderlyingRows | null
  /** Filtres actifs, décrits en clair pour le bandeau du tiroir. */
  filterLabels: string[]
  exportRows: () => void
}

export function useTileDetail(title: string, query: QuerySpec, globalFilters: FilterClause[]): TileDetail {
  const { t } = useTranslation()
  const rows = useSourceRows(query.source)
  const sheet = useExcelStore((s) => s.sheets[s.activeSheetIndex] ?? null)

  // ⚠⚠ MÊME résolution que `useTileData` : une source différente ici montrerait un détail
  // qui ne compose pas le chiffre de la tuile.
  const source = useMemo(() => {
    const registered = getSource(query.source)
    return registered.id === 'pim.products' ? effectivePimSource(sheet) : registered
  }, [query.source, sheet])

  const filters = useMemo(
    () => [...query.filters, ...globalFilters], [query.filters, globalFilters])

  const detail = useMemo(
    () => underlyingRows(rows, filters, source, MAX_DETAIL_ROWS),
    [rows, filters, source])

  const filterLabels = useMemo(
    () => filters.map((f) => describeFilter(f, dimensionLabel(source, f.field, t))),
    [filters, source, t])

  const exportRows = useCallback(() => {
    if (!detail || detail.total === 0) { toast.error(t('bi.export.nothing')); return }
    exportBoardToXlsx([{
      title,
      // Le détail se lit comme un résultat d'agrégation sans mesure : que des colonnes.
      result: {
        columns: detail.columns.map((c) => ({ ...c, role: 'dimension' as const })),
        rows: detail.rows as Record<string, string | number | null>[],
      },
      headers: detail.columns.map((c) => biLabel(c, t)),
    }], {
      boardName: title,
      sourceLabel: t(source.labelKey as TranslationKey),
      filters: filterLabels,
      takenAt: new Date().toLocaleString('fr-FR'),
    })
  }, [detail, title, source, filterLabels, t])

  return { detail, filterLabels, exportRows }
}
