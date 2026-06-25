import { createHash } from 'node:crypto'

export type Route =
  | { kind: 'list' }
  | { kind: 'columns'; docId: string }
  | { kind: 'row'; docId: string }
  | { kind: 'csv'; docId: string }
  | { kind: 'unknown' }

export interface DatasetSummary { docId: string; fileName: string; sheetCount: number; rowCount: number }
export interface ColumnInfo { key: string; label: string; fieldType: string }
interface ValueEntry { key: string; label: string; value: string }
export interface RowResult { rowIndex: number; total: number; values: ValueEntry[] }
export interface Sheet {
  columns: Array<{ key: string; label: string; fieldType?: string }>
  rows: Array<Record<string, unknown>>
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function parseRoute(path: string): Route {
  const parts = path.split('/').filter(Boolean) // "/datasets/abc/row" → ["datasets","abc","row"]
  if (parts[0] !== 'datasets') return { kind: 'unknown' }
  if (parts.length === 1) return { kind: 'list' }
  const docId = parts[1]
  if (parts.length === 2) return { kind: 'columns', docId }
  if (parts.length === 3 && parts[2] === 'row') return { kind: 'row', docId }
  if (parts.length === 3 && parts[2] === 'csv') return { kind: 'csv', docId }
  return { kind: 'unknown' }
}

/** Génère le CSV (Fusion de données InDesign) : 1re ligne = libellés, puis 1 ligne par
 *  enregistrement. Échappement RFC 4180 (guillemets doublés, champ cité si , " ou saut). */
export function toCsv(sheets: Sheet[]): string {
  const sheet = sheets[0]
  if (!sheet) return ''
  const cols = sheet.columns ?? []
  const esc = (v: unknown): string => {
    const s = v === undefined || v === null ? '' : String(v)
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const header = cols.map((c) => esc(c.label)).join(',')
  const lines = (sheet.rows ?? []).map((row) => cols.map((c) => esc(row[c.key])).join(','))
  return [header, ...lines].join('\r\n')
}

export function projectDataset(docId: string, data: Record<string, unknown>): DatasetSummary {
  return {
    docId,
    fileName: typeof data.fileName === 'string' ? data.fileName : docId,
    sheetCount: typeof data.sheetCount === 'number' ? data.sheetCount : 0,
    rowCount: typeof data.totalRows === 'number' ? data.totalRows : 0,
  }
}

export function firstSheetColumns(sheets: Sheet[]): ColumnInfo[] {
  const cols = sheets[0]?.columns ?? []
  return cols.map((c) => ({ key: c.key, label: c.label, fieldType: c.fieldType ?? 'text' }))
}

export function projectRow(sheets: Sheet[], i: number): RowResult {
  const sheet = sheets[0]
  const rows = sheet?.rows ?? []
  const total = rows.length
  if (total === 0) return { rowIndex: 0, total: 0, values: [] }
  const rowIndex = Math.max(0, Math.min(i, total - 1))
  const row = rows[rowIndex]
  const values: ValueEntry[] = (sheet?.columns ?? []).map((c) => {
    const raw = row[c.key]
    return { key: c.key, label: c.label, value: raw === undefined || raw === null ? '' : String(raw) }
  })
  return { rowIndex, total, values }
}
