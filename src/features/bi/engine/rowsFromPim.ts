import type { Product } from '@/features/pim/types'
import type { ExcelSheet } from '@/features/excel/types'
import { assertNoReservedSheetColumn, productToRow, TAXO_LEVELS } from '../registry/pim.source'
import type { Row } from '../registry/types'

/**
 * Produits → lignes. Les colonnes attendues sont l'UNION de tous les champs rencontrés,
 * sauf si l'appelant impose une liste (schéma de la source).
 */
export function pimRows(products: Product[], columns: string[]): Row[] {
  const cols = columns.length
    ? columns
    : [...new Set(products.flatMap((p) => Object.keys(p.fields)))].sort()
  return products.map((p) => productToRow(p, cols))
}

/**
 * Feuille active du module Données → lignes. C'est ce que l'utilisateur voit RÉELLEMENT
 * (`useExcelStore`), contrairement au catalogue master du PIM qui ne sert que de repli.
 *
 * ⚠ Même règle de complétude que `productToRow` : une valeur vide ou faite d'espaces ne
 * compte pas comme renseignée — sinon la mesure de complétude mentirait sur cette source.
 */
export function rowsFromSheet(sheet: ExcelSheet): Row[] {
  const cols = sheet.columns.map((c) => c.key)
  // ⚠⚠ AVANT toute copie : les clés du moteur (`_filled`, `_total`, `taxo.N`) sont posées
  // APRÈS les colonnes, une colonne homonyme les écrasait donc en silence.
  assertNoReservedSheetColumn(cols)

  // Inversion { colKey: niveau } → { niveau: colKey }, hors boucle : une feuille n'a
  // qu'une poignée de niveaux, pas la peine de la refaire à chaque ligne.
  const colByLevel = new Map<number, string>()
  for (const [colKey, level] of Object.entries(sheet.taxonomyLevels ?? {})) {
    colByLevel.set(level, colKey)
  }

  return sheet.rows.map((r) => {
    const row: Row = { _id: r._id }
    let filled = 0
    for (const c of cols) {
      const v = r[c] ?? null
      row[c] = v
      if (v !== null && v !== undefined && String(v).trim() !== '') filled++
    }
    for (let i = 0; i < TAXO_LEVELS; i++) {
      const colKey = colByLevel.get(i + 1)
      const v = colKey ? r[colKey] : null
      row[`taxo.${i + 1}`] = v === null || v === undefined || String(v).trim() === '' ? null : v
    }
    row._filled = filled
    row._total = cols.length
    return row
  })
}
