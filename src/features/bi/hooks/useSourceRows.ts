// Les lignes de la source ACTIVE, telles que les tuiles les lisent.
//
// ⚠ Sert au constructeur, pas au calcul : c'est ce qui permet à un filtre de proposer les
// valeurs qui EXISTENT vraiment. Sans lui, on retombe sur une saisie libre — et « makita »
// tapé là où la donnée porte « MAKITA » ne retient aucune ligne, en silence.
//
// ⚠⚠ Les trois chemins sont ceux de `useTileData`, dans le même ordre : la feuille active du
// module Données, puis le catalogue master du PIM, puis les sources de veille. Deux
// raisonnements divergents feraient proposer des valeurs qu'aucune tuile ne retrouverait.
import { useMemo } from 'react'
import { useExcelStore } from '@/stores/excel.store'
import { usePimStore } from '@/stores/pim.store'
import { pimRows, rowsFromSheet } from '../engine/rowsFromPim'
import { isWatchSource, useWatchSourceState } from './useWatchData'
import type { Row } from '../registry/types'
import type { SourceId } from '../types'

export function useSourceRows(sourceId: SourceId): Row[] {
  const sheet = useExcelStore((s) => s.sheets[s.activeSheetIndex] ?? null)
  const products = usePimStore((s) => s.products)
  const watch = useWatchSourceState(sourceId)

  return useMemo(() => {
    if (isWatchSource(sourceId)) return watch.rows
    const hasSheet = sheet !== null && sheet.columns.length > 0
    if (hasSheet) return rowsFromSheet(sheet)
    return products.length > 0 ? pimRows(products, []) : []
  }, [sourceId, watch.rows, sheet, products])
}
