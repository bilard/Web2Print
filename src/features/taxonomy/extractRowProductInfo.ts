import type { ExcelColumn, ExcelRow, ExcelSheet, CellValue } from '@/features/excel/types'
import { evaluateFormula } from '@/features/excel/formulaEngine'
import type { ProductClassificationInput } from './aiClassifyProduct'

/** Heuristiques calquées sur ProductSheet.tsx pour extraire des données produit
 *  d'une row arbitraire — réutilisées pour la classification IA en lot. */
const isRefKey = (k: string) => /ref(erence)?|sku|code|modele/i.test(k)
const isDescKey = (k: string) => /desc|accroche|subtitle|sous.?titre/i.test(k)
const isBrandKey = (k: string) => /marque|brand|fabricant/i.test(k)
const isUrlKey = (k: string) =>
  /^url$|page.?url|product.?url|fiche.?url|source.?url|url.?produit|url.?fiche|url.?source/i.test(k)
const isTitleKey = (k: string) =>
  /libell|d[eé]signation|nom.?(article|produit)?|titre|title|product.?name/i.test(k)
const isPriceKey = (k: string) => /prix|price|tarif/i.test(k)
const isAvailKey = (k: string) => /dispo|stock|avail/i.test(k)
const isEanKey = (k: string) => /ean|barcode|code.?barre/i.test(k)
const isDocKey = (k: string) => /^documents?$|pdf|video|notice|lien|link|url/i.test(k)
const isSpecKey = (k: string) => /spec|tech|caract/i.test(k)
const isAdvKey = (k: string) => /avantage|advantage|feature|benefit/i.test(k)

const BREADCRUMB_SPLIT_RE = /\s*[›>/»·]\s*/

function getValue(col: ExcelColumn, row: ExcelRow, columns: ExcelColumn[]): CellValue {
  return col.fieldType === 'formula' && col.formula
    ? evaluateFormula(col.formula, row, columns)
    : row[col.key]
}

function firstStringValue(
  cols: ExcelColumn[],
  row: ExcelRow,
  columns: ExcelColumn[],
  predicate: (c: ExcelColumn) => boolean,
): string | undefined {
  const col = cols.find(predicate) ?? columns.find(predicate)
  if (!col) return undefined
  const v = getValue(col, row, columns)
  if (v === null || v === undefined || v === '') return undefined
  return String(v)
}

/** Construit l'entrée de classification IA à partir d'une row de la sheet.
 *  - Titre : colonne explicite (libellé/désignation) sinon primary non-taxo non-meta.
 *  - Catégorie source : valeurs des colonnes-taxo de la sheet, jointes par " > ".
 *  - Breadcrumb scrapé : `ai_breadcrumb` si présent. */
export function extractRowProductInfo(
  sheet: ExcelSheet,
  row: ExcelRow,
): ProductClassificationInput {
  const hidden = new Set(sheet.hiddenColumns ?? [])
  const visibleCols = sheet.columns.filter((c) => !hidden.has(c.key))
  const levels = sheet.taxonomyLevels ?? {}

  const isTaxoCol = (c: ExcelColumn) => (levels[c.key] ?? 0) > 0
  const isMetaCol = (c: ExcelColumn) =>
    isRefKey(c.key) ||
    isBrandKey(c.key) ||
    isPriceKey(c.key) ||
    isAvailKey(c.key) ||
    isEanKey(c.key) ||
    isDocKey(c.key) ||
    c.key.startsWith('ai_')

  const primaryCol = visibleCols.find((c) => c.isPrimary) ?? visibleCols[0]
  const titleCol =
    visibleCols.find((c) => !isTaxoCol(c) && isTitleKey(c.key)) ??
    (primaryCol && !isTaxoCol(primaryCol) && !isMetaCol(primaryCol) ? primaryCol : undefined) ??
    visibleCols.find(
      (c) => !isTaxoCol(c) && !isMetaCol(c) && !isDescKey(c.key) && !isSpecKey(c.key) && !isAdvKey(c.key),
    )

  const title = titleCol ? String(getValue(titleCol, row, sheet.columns) ?? '').trim() : ''

  const brand = firstStringValue(visibleCols, row, sheet.columns, (c) => isBrandKey(c.key) || isBrandKey(c.label))
  const sku = firstStringValue(visibleCols, row, sheet.columns, (c) => isRefKey(c.key) || isRefKey(c.label))
  const description = firstStringValue(
    visibleCols,
    row,
    sheet.columns,
    (c) => isDescKey(c.key) || isDescKey(c.label),
  )
  const sourceUrl = firstStringValue(visibleCols, row, sheet.columns, (c) => isUrlKey(c.key) || isUrlKey(c.label))

  const taxoCols = visibleCols
    .filter((c) => (levels[c.key] ?? 0) > 0)
    .sort((a, b) => (levels[a.key] ?? 0) - (levels[b.key] ?? 0))
  const sourceCategoryPath =
    taxoCols
      .map((c) => String(getValue(c, row, sheet.columns) ?? '').trim())
      .filter(Boolean)
      .join(' > ') || undefined

  const breadcrumbRaw = row.ai_breadcrumb
  const sourceBreadcrumb =
    typeof breadcrumbRaw === 'string' && breadcrumbRaw.trim()
      ? breadcrumbRaw.split(BREADCRUMB_SPLIT_RE).map((s) => s.trim()).filter(Boolean)
      : undefined

  return {
    title: title || undefined,
    brand,
    description,
    sku,
    sourceBreadcrumb,
    sourceCategoryPath,
    sourceUrl,
  }
}

/** Renvoie true si la row a au moins un signal exploitable pour la classification. */
export function hasClassificationSignal(input: ProductClassificationInput): boolean {
  return !!(
    input.title ||
    input.description ||
    (input.sourceBreadcrumb && input.sourceBreadcrumb.length > 0) ||
    input.sourceCategoryPath
  )
}
