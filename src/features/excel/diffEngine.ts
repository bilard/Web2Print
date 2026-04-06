import type { ExcelSheet, ExcelColumn, ExcelRow, CellValue } from './types'

export type DiffType = 'added' | 'removed' | 'modified' | 'unchanged'

export interface ColumnDiff {
  key: string
  label: string
  type: DiffType
  oldLabel?: string
}

export interface CellDiff {
  colKey: string
  type: DiffType
  oldValue: CellValue
  newValue: CellValue
}

export interface RowDiff {
  type: DiffType
  rowId: string
  /** For 'modified' rows, which cells changed */
  cells: CellDiff[]
  /** The row data (new for added/modified, old for removed) */
  data: ExcelRow
}

export interface SheetDiff {
  name: string
  columns: ColumnDiff[]
  rows: RowDiff[]
  summary: {
    columnsAdded: number
    columnsRemoved: number
    rowsAdded: number
    rowsRemoved: number
    rowsModified: number
    cellsModified: number
  }
}

function normalizeValue(v: CellValue): string {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

/**
 * Find the best primary key column to match rows between old and new sheets.
 * Prefers: explicit isPrimary > first column with unique values.
 */
function findMatchKey(oldSheet: ExcelSheet, newSheet: ExcelSheet): string | null {
  // Try the isPrimary column first
  const oldPrimary = oldSheet.columns.find((c) => c.isPrimary)
  if (oldPrimary) {
    const matchInNew = newSheet.columns.find((c) => c.key === oldPrimary.key || c.label === oldPrimary.label)
    if (matchInNew) return oldPrimary.key
  }

  // Try first column (most likely an ID)
  const oldFirst = oldSheet.columns[0]
  if (oldFirst) {
    const vals = oldSheet.rows.map((r) => normalizeValue(r[oldFirst.key]))
    const unique = new Set(vals)
    if (unique.size === vals.length && vals.length > 0) return oldFirst.key
  }

  return oldSheet.columns[0]?.key ?? null
}

/**
 * Map new column keys to old column keys by label matching.
 */
function mapColumns(oldCols: ExcelColumn[], newCols: ExcelColumn[]): Map<string, string> {
  const map = new Map<string, string>() // newKey → oldKey
  const oldByLabel = new Map(oldCols.map((c) => [c.label.toLowerCase().trim(), c.key]))
  const oldByKey = new Set(oldCols.map((c) => c.key))

  for (const nc of newCols) {
    // Exact key match
    if (oldByKey.has(nc.key)) {
      map.set(nc.key, nc.key)
      continue
    }
    // Label match
    const oldKey = oldByLabel.get(nc.label.toLowerCase().trim())
    if (oldKey) {
      map.set(nc.key, oldKey)
    }
  }
  return map
}

export function diffSheets(oldSheet: ExcelSheet, newSheet: ExcelSheet): SheetDiff {
  const colMap = mapColumns(oldSheet.columns, newSheet.columns)
  const oldColKeys = new Set(oldSheet.columns.map((c) => c.key))
  const newColKeys = new Set(newSheet.columns.map((c) => c.key))

  // Column diffs
  const columns: ColumnDiff[] = []
  const mappedOldKeys = new Set(colMap.values())

  for (const nc of newSheet.columns) {
    const oldKey = colMap.get(nc.key)
    if (oldKey) {
      const oldCol = oldSheet.columns.find((c) => c.key === oldKey)!
      columns.push({
        key: nc.key,
        label: nc.label,
        type: oldCol.label !== nc.label ? 'modified' : 'unchanged',
        oldLabel: oldCol.label !== nc.label ? oldCol.label : undefined,
      })
    } else {
      columns.push({ key: nc.key, label: nc.label, type: 'added' })
    }
  }

  for (const oc of oldSheet.columns) {
    if (!mappedOldKeys.has(oc.key)) {
      columns.push({ key: oc.key, label: oc.label, type: 'removed' })
    }
  }

  // Row diffs — match by primary/first column value
  const matchKey = findMatchKey(oldSheet, newSheet)
  const newMatchKey = matchKey ? (colMap.has(matchKey) ? matchKey : null) : null
  const oldMatchKey = matchKey

  // Build index of old rows by match value
  const oldRowIndex = new Map<string, ExcelRow>()
  if (oldMatchKey) {
    for (const row of oldSheet.rows) {
      const key = normalizeValue(row[oldMatchKey])
      if (key) oldRowIndex.set(key, row)
    }
  }

  const rows: RowDiff[] = []
  const matchedOldKeys = new Set<string>()
  let cellsModified = 0

  for (const newRow of newSheet.rows) {
    const matchVal = newMatchKey ? normalizeValue(newRow[newMatchKey]) : null
    const oldRow = matchVal ? oldRowIndex.get(matchVal) : null

    if (oldRow && matchVal) {
      matchedOldKeys.add(matchVal)

      // Compare cells
      const cells: CellDiff[] = []
      for (const nc of newSheet.columns) {
        const oldKey = colMap.get(nc.key)
        if (!oldKey) {
          // New column — all cells are "added"
          cells.push({ colKey: nc.key, type: 'added', oldValue: null, newValue: newRow[nc.key] })
        } else {
          const oldVal = normalizeValue(oldRow[oldKey])
          const newVal = normalizeValue(newRow[nc.key])
          if (oldVal !== newVal) {
            cells.push({ colKey: nc.key, type: 'modified', oldValue: oldRow[oldKey], newValue: newRow[nc.key] })
            cellsModified++
          }
        }
      }

      rows.push({
        type: cells.some((c) => c.type !== 'unchanged') ? 'modified' : 'unchanged',
        rowId: newRow._id,
        cells,
        data: newRow,
      })
    } else {
      rows.push({ type: 'added', rowId: newRow._id, cells: [], data: newRow })
    }
  }

  // Removed rows
  if (oldMatchKey) {
    for (const oldRow of oldSheet.rows) {
      const key = normalizeValue(oldRow[oldMatchKey])
      if (key && !matchedOldKeys.has(key)) {
        rows.push({ type: 'removed', rowId: oldRow._id, cells: [], data: oldRow })
      }
    }
  }

  const summary = {
    columnsAdded: columns.filter((c) => c.type === 'added').length,
    columnsRemoved: columns.filter((c) => c.type === 'removed').length,
    rowsAdded: rows.filter((r) => r.type === 'added').length,
    rowsRemoved: rows.filter((r) => r.type === 'removed').length,
    rowsModified: rows.filter((r) => r.type === 'modified').length,
    cellsModified,
  }

  return { name: newSheet.name, columns, rows, summary }
}
