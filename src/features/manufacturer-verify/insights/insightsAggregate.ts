/**
 * Agrégateur BI des écarts Source (revendeur) ⇄ Fabricant.
 *
 * Portée = document PIM ACTIF (le store `useExcelStore` ne tient que la base
 * ouverte, pas tous les documents Firestore). Toute la logique est PURE et
 * déterministe : on recompose la comparaison de chaque ligne vérifiée via
 * `buildRowComparison` (aucun LLM, aucun réseau) puis on agrège.
 */
import type { ExcelSheet, ExcelRow } from '@/features/excel/types'
import { buildRowComparison } from '../compareProducts'
import type { CompareStatus, FieldComparison } from '../types'

export type StatusCounts = Record<CompareStatus, number>
type Group = FieldComparison['group']

const GROUPS: Group[] = ['identity', 'price', 'spec', 'content']

/** Statistiques agrégées d'un même champ à travers tous les produits vérifiés. */
export interface FieldStat {
  /** Identité stable inter-produits : `group|libellé`. */
  id: string
  label: string
  group: Group
  counts: StatusCounts
  adopted: number
  total: number
  /** Taux d'écart réel = diff / (match + diff) ; NaN→0 si aucun champ commun. */
  divergenceRate: number
}

/** Ligne de synthèse par produit vérifié. */
export interface ProductStat {
  sheetIndex: number
  sheetName: string
  rowId: string
  name: string
  brand: string | null
  confidence: 'high' | 'medium' | 'low' | null
  /** true = même EAN certifié, false = EAN divergents, null = non comparable. */
  eanMatch: boolean | null
  specMatch: number
  specDiff: number
  specCompleted: number
  identityDiff: number
  adopted: number
}

export interface InsightsData {
  verifiedCount: number
  products: ProductStat[]
  /** Répartition des statuts, tous groupes confondus. */
  statusTotals: StatusCounts
  byGroup: Record<Group, StatusCounts>
  fields: FieldStat[]
  divergentFields: number
  completedFields: number
  matchFields: number
  adoptedTotal: number
  /** Nombre de produits ayant au moins un champ d'identité divergent. */
  identityDivergentProducts: number
  eanMatched: number
  eanMismatched: number
  eanUnknown: number
  confidence: { high: number; medium: number; low: number }
}

const emptyCounts = (): StatusCounts => ({ match: 0, diff: 0, 'mfr-only': 0, 'source-only': 0 })

function cellStr(row: ExcelRow, key: string): string | null {
  const v = row[key]
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s.length > 0 ? s : null
}

function readConfidence(row: ExcelRow): ProductStat['confidence'] {
  const c = cellStr(row, 'ai_mfr_confidence')
  return c === 'high' || c === 'medium' || c === 'low' ? c : null
}

/**
 * Parcourt toutes les feuilles du document actif et agrège les écarts de chaque
 * ligne vérifiée. `buildRowComparison` renvoie `null` pour une ligne sans data
 * fabricant : c'est notre filtre gratuit (pas de sniff de colonne).
 */
export function aggregateInsights(sheets: ExcelSheet[]): InsightsData {
  const products: ProductStat[] = []
  const statusTotals = emptyCounts()
  const byGroup: Record<Group, StatusCounts> = {
    identity: emptyCounts(), price: emptyCounts(), spec: emptyCounts(), content: emptyCounts(),
  }
  const fieldMap = new Map<string, FieldStat>()
  const confidence = { high: 0, medium: 0, low: 0 }
  let adoptedTotal = 0
  let identityDivergentProducts = 0
  let eanMatched = 0
  let eanMismatched = 0
  let eanUnknown = 0

  sheets.forEach((sheet, sheetIndex) => {
    for (const row of sheet.rows) {
      const comparisons = buildRowComparison(row, sheet.columns)
      if (!comparisons) continue

      const p: ProductStat = {
        sheetIndex, sheetName: sheet.name, rowId: row._id,
        name: row._id, brand: null, confidence: readConfidence(row),
        eanMatch: null, specMatch: 0, specDiff: 0, specCompleted: 0, identityDiff: 0, adopted: 0,
      }

      for (const c of comparisons) {
        statusTotals[c.status] += 1
        byGroup[c.group][c.status] += 1
        if (c.adopted) { adoptedTotal += 1; p.adopted += 1 }

        // Champ agrégé inter-produits (clé group|libellé, insensible à la casse).
        const fid = `${c.group}|${c.label.toLowerCase()}`
        let fs = fieldMap.get(fid)
        if (!fs) {
          fs = { id: fid, label: c.label, group: c.group, counts: emptyCounts(), adopted: 0, total: 0, divergenceRate: 0 }
          fieldMap.set(fid, fs)
        }
        fs.counts[c.status] += 1
        fs.total += 1
        if (c.adopted) fs.adopted += 1

        if (c.group === 'spec') {
          if (c.status === 'match') p.specMatch += 1
          else if (c.status === 'diff') p.specDiff += 1
          else if (c.status === 'mfr-only') p.specCompleted += 1
        }
        if (c.group === 'identity') {
          if (c.status === 'diff') p.identityDiff += 1
          if (c.key === 'id:name') p.name = c.sourceValue ?? c.mfrValue ?? p.name
          if (c.key === 'id:brand') p.brand = c.sourceValue ?? c.mfrValue ?? p.brand
          if (c.key === 'id:ean') {
            p.eanMatch = c.status === 'match' ? true : c.status === 'diff' ? false : null
          }
        }
      }

      if (p.identityDiff > 0) identityDivergentProducts += 1
      if (p.eanMatch === true) eanMatched += 1
      else if (p.eanMatch === false) eanMismatched += 1
      else eanUnknown += 1
      if (p.confidence) confidence[p.confidence] += 1
      products.push(p)
    }
  })

  const fields = [...fieldMap.values()].map((f) => {
    const common = f.counts.match + f.counts.diff
    return { ...f, divergenceRate: common > 0 ? f.counts.diff / common : 0 }
  })

  return {
    verifiedCount: products.length,
    products,
    statusTotals,
    byGroup,
    fields,
    divergentFields: GROUPS.reduce((n, g) => n + byGroup[g].diff, 0),
    completedFields: GROUPS.reduce((n, g) => n + byGroup[g]['mfr-only'], 0),
    matchFields: GROUPS.reduce((n, g) => n + byGroup[g].match, 0),
    adoptedTotal,
    identityDivergentProducts,
    eanMatched,
    eanMismatched,
    eanUnknown,
    confidence,
  }
}
