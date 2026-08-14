// Résultat plat → matrice croisée. PUR. Le tableau croisé n'est pas un graphe : `chart.js`
// ne sait pas le faire, et c'est le visuel le plus utilisé d'un outil décisionnel.
import type { AggregateResult } from './aggregate'

export interface PivotMatrix {
  columns: (string | null)[]
  rows: { key: string | null; cells: (number | null)[]; total: number }[]
  columnTotals: number[]
  grandTotal: number
}

// ⚠ Ordre alphabétique FR, `null` (valeur absente) toujours en fin quel que soit le sens —
// même convention que le tri de `aggregate.ts`, pour que les deux ne se contredisent pas.
function compareKeys(a: string | null, b: string | null): number {
  if (a === null) return b === null ? 0 : 1
  if (b === null) return -1
  return a.localeCompare(b, 'fr')
}

export function toPivot(
  result: AggregateResult, rowDim: string, colDim: string, measureKey: string,
): PivotMatrix {
  const columns: (string | null)[] = []
  const rowKeys: (string | null)[] = []
  const cells = new Map<string, number>()

  for (const r of result.rows) {
    const rk = (r[rowDim] ?? null) as string | null
    const ck = (r[colDim] ?? null) as string | null
    if (!rowKeys.some((k) => k === rk)) rowKeys.push(rk)
    if (!columns.some((k) => k === ck)) columns.push(ck)
    cells.set(JSON.stringify([rk, ck]), Number(r[measureKey] ?? 0))
  }
  // ⚠⚠ Sans ce tri, l'ordre suit la première apparition dans `result.rows` — non
  // déterministe d'un rendu à l'autre pour une même donnée agrégée (le moteur d'agrégation
  // ne trie que la PREMIÈRE dimension, jamais la seconde). Un tableau croisé dont les axes
  // bougent sans que la donnée change devient impossible à comparer d'une consultation à
  // l'autre.
  columns.sort(compareKeys)
  rowKeys.sort(compareKeys)

  const rows = rowKeys.map((key) => {
    // ⚠ `null` = croisement JAMAIS mesuré. Y écrire 0 affirmerait une absence de produits
    // qui n'a pas été constatée.
    const line = columns.map((c) => cells.get(JSON.stringify([key, c])) ?? null)
    return { key, cells: line, total: line.reduce<number>((n, v) => n + (v ?? 0), 0) }
  })

  const columnTotals = columns.map((_, i) => rows.reduce((n, r) => n + (r.cells[i] ?? 0), 0))
  return { columns, rows, columnTotals, grandTotal: columnTotals.reduce((n, v) => n + v, 0) }
}
