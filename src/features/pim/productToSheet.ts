import type { Product, Source } from './types'
import type { ExcelSheet, ExcelRow, ExcelColumn, CellValue } from '@/features/excel/types'

/** Construit une ExcelSheet synthétique à partir des produits master du projet PIM.
 *  Les colonnes sont l'union des keys présents dans `fields` et `sourceLinks[].snapshot`.
 *  Pour les colonnes per-source (price, image, …), on prend la valeur du primarySource
 *  d'abord, sinon du 1er sourceLink.
 */
export function pimProductsToSheet(
  products: Product[],
  _sources: Source[],
  sheetName = 'Produits',
): ExcelSheet {
  const allKeys = new Set<string>()
  for (const p of products) {
    Object.keys(p.fields).forEach((k) => allKeys.add(k))
    for (const link of p.sourceLinks) {
      Object.keys(link.snapshot).forEach((k) => allKeys.add(k))
    }
  }

  // Met les colonnes prioritaires en tête si présentes
  const priority = ['sku', 'ean', 'name', 'brand', 'description', 'price', 'image']
  const ordered = priority
    .filter((k) => allKeys.has(k))
    .concat([...allKeys].filter((k) => !priority.includes(k)))

  const columns: ExcelColumn[] = ordered.map((key) => ({
    key,
    label: key.charAt(0).toUpperCase() + key.slice(1),
    fieldType: 'text',
    detectedType: 'text',
    isPrimary: key === 'sku' || key === 'ean',
    width: 150,
  }))

  const rows: ExcelRow[] = products.map((p) => {
    const row: ExcelRow = { _id: p._id }
    for (const k of ordered) {
      // 1. Champ master consolidé (peut avoir value: null explicite — on l'accepte)
      if (k in p.fields) {
        row[k] = p.fields[k].value
        continue
      }
      // 2. Snapshot du primarySource d'abord, sinon du 1er link
      const primaryLink =
        p.sourceLinks.find((l) => l.sourceId === p.primarySourceId) ?? p.sourceLinks[0]
      const v = primaryLink?.snapshot[k]
      row[k] = (v === undefined ? null : v) as CellValue
    }
    return row
  })

  return {
    name: sheetName,
    columns,
    rows,
    taxonomy: [],
  }
}
