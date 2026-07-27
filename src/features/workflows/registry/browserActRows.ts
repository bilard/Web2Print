// Helpers PURS du node BrowserAct : lecture des paramètres saisis et mise en feuille des
// lignes rendues par un bot. Séparés du node pour être testables sans registre ni réseau.
import type { ExcelColumn, ExcelRow, ExcelSheet } from '@/features/excel/types'

/** Paires `nom = valeur` (une par ligne) → objet. Lignes vides et `#` ignorés. */
export function parseParamLines(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of (text ?? '').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq <= 0) continue
    const name = t.slice(0, eq).trim()
    if (name) out[name] = t.slice(eq + 1).trim()
  }
  return out
}

/**
 * Lignes hétérogènes → feuille. Les colonnes sont l'UNION des clés rencontrées, dans
 * l'ordre de première apparition : un bot peut omettre un champ sur une ligne, la colonne
 * doit exister quand même (sinon la donnée d'une autre ligne serait perdue).
 */
export function rowsToSheet(rows: Record<string, unknown>[], name: string): ExcelSheet {
  const keys: string[] = []
  for (const r of rows) for (const k of Object.keys(r)) if (!keys.includes(k)) keys.push(k)
  const columns: ExcelColumn[] = keys.map((k, i) => ({
    key: k,
    label: k,
    fieldType: 'text',
    detectedType: 'text',
    isPrimary: i === 0,
    width: 220,
  }))
  const cell = (v: unknown): string =>
    v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
  const excelRows: ExcelRow[] = rows.map((r, i) => {
    const row: ExcelRow = { _id: `ba_${i}` }
    for (const k of keys) row[k] = cell(r[k]) as ExcelRow[string]
    return row
  })
  return { name, columns, rows: excelRows, taxonomy: [] }
}
