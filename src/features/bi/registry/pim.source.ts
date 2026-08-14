// Source « produits du PIM » : ses colonnes sont DYNAMIQUES (elles viennent du schéma du
// projet), ses dimensions fixes sont la taxonomie et les dates.
import type { Product } from '@/features/pim/types'
import type { DataSource, Dimension, Row } from './types'

/** Profondeur de taxonomie exposée en dimensions (cf. taxonomie à 4 niveaux). */
const TAXO_LEVELS = 4

/**
 * Produit → ligne plate consommable par le moteur.
 *
 * ⚠ `_filled` / `_total` sont calculés ICI, une fois, plutôt que dans chaque mesure : la
 * complétude se lit sur les colonnes DEMANDÉES, pas sur les clés présentes — un produit
 * sans le champ « poids » doit compter comme non renseigné, pas être ignoré.
 */
export function productToRow(p: Product, columns: string[]): Row {
  const row: Row = { _id: p._id, _sku: p.masterSku, _createdAt: p.createdAt, _updatedAt: p.updatedAt }
  let filled = 0
  for (const c of columns) {
    const v = p.fields[c]?.value ?? null
    row[c] = v
    if (v !== null && v !== undefined && String(v).trim() !== '') filled++
  }
  for (let i = 0; i < TAXO_LEVELS; i++) row[`taxo.${i + 1}`] = p.taxonomyPath[i] ?? null
  row._filled = filled
  row._total = columns.length
  return row
}

const taxoDimensions: Dimension[] = Array.from({ length: TAXO_LEVELS }, (_, i) => ({
  id: `taxo.${i + 1}`,
  labelKey: `bi.dim.taxo${i + 1}` as Dimension['labelKey'],
  kind: 'text' as const,
  get: (r: Row) => r[`taxo.${i + 1}`],
}))

const numbersOf = (rows: Row[], key: string): number[] =>
  rows.map((r) => Number(r[key])).filter((n) => Number.isFinite(n))

export const pimSource: DataSource = {
  id: 'pim.products',
  labelKey: 'bi.source.pim',
  engine: 'client',
  dimensions: [
    ...taxoDimensions,
    { id: '_createdAt', labelKey: 'bi.dim.createdAt', kind: 'date', get: (r) => r._createdAt },
    { id: '_updatedAt', labelKey: 'bi.dim.updatedAt', kind: 'date', get: (r) => r._updatedAt },
  ],
  measures: [
    { id: 'count', labelKey: 'bi.measure.count', format: 'int', aggregable: true,
      compute: (rows) => rows.length },
    // Complétude = champs renseignés / champs attendus, sur l'ensemble des lignes du groupe.
    { id: 'pim.completeness', labelKey: 'bi.measure.completeness', format: 'pct', aggregable: false,
      compute: (rows) => {
        const total = rows.reduce((n, r) => n + Number(r._total ?? 0), 0)
        if (total === 0) return 0
        return (rows.reduce((n, r) => n + Number(r._filled ?? 0), 0) / total) * 100
      } },
    { id: 'pim.filled', labelKey: 'bi.measure.filled', format: 'int', aggregable: true,
      compute: (rows) => rows.reduce((n, r) => n + Number(r._filled ?? 0), 0) },
    { id: 'pim.freshnessDays', labelKey: 'bi.measure.freshness', format: 'float', aggregable: false,
      compute: (rows) => {
        const ages = numbersOf(rows, '_updatedAt').map((ts) => (Date.now() - ts) / 86_400_000)
        if (!ages.length) return 0
        const sorted = ages.sort((a, b) => a - b)
        return sorted[Math.floor(sorted.length / 2)]
      } },
  ],
}
