// Rassemble les données de TOUTES les tuiles d'une page, puis écrit le classeur.
//
// ⚠ Les tuiles calculent chacune de leur côté, dans leur propre composant : leurs résultats
// ne sont nulle part rassemblés. On les recalcule donc ici, une fois, au moment de l'export —
// plutôt que de faire remonter en continu les résultats de vingt tuiles, ce qui coûterait à
// chaque rendu pour un geste qu'on fait rarement.
import { useCallback } from 'react'
import { toast } from 'sonner'
import { aggregate } from '../engine/aggregate'
import { biLabel } from '../components/biLabel'
import { describeFilter } from '../filters/filterOptions'
import { dimensionLabel } from '../filters/dimensionLabel'
import { exportBoardToXlsx, type ExportedTile } from './exportBoard'
import { useTranslation, type TranslationKey } from '@/lib/i18n'
import type { DataSource, Row } from '../registry/types'
import type { FilterClause, Tile } from '../types'

export function useBoardExport(
  boardName: string,
  tiles: Tile[],
  source: DataSource,
  rows: Row[],
  filters: FilterClause[],
) {
  const { t } = useTranslation()

  return useCallback(() => {
    if (tiles.length === 0 || rows.length === 0) {
      // ⚠ Un classeur vide se lit comme un export raté : mieux vaut refuser en disant pourquoi.
      toast.error(t('bi.export.nothing'))
      return
    }
    const exported: ExportedTile[] = []
    for (const tile of tiles) {
      try {
        const merged = { ...tile.query, filters: [...tile.query.filters, ...filters] }
        const result = aggregate(rows, merged, source)
        exported.push({
          title: tile.title,
          result,
          headers: result.columns.map((c) => biLabel(c, t)),
        })
      } catch {
        // ⚠ Une tuile en erreur ne doit pas emporter tout l'export : les autres partent, et
        // l'absence de sa feuille se remarque — un classeur incomplet vaut mieux que rien.
        continue
      }
    }
    if (exported.length === 0) {
      toast.error(t('bi.export.nothing'))
      return
    }
    exportBoardToXlsx(exported, {
      boardName,
      sourceLabel: t(source.labelKey as TranslationKey),
      filters: filters.map((f) => describeFilter(f, dimensionLabel(source, f.field, t))),
      takenAt: new Date().toLocaleString('fr-FR'),
    })
    toast.success(t('bi.export.done', { count: exported.length }))
  }, [boardName, tiles, source, rows, filters, t])
}
