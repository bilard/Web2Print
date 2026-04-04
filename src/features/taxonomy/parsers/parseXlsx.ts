// src/features/taxonomy/parsers/parseXlsx.ts
import * as XLSX from 'xlsx'
import type { TaxonomyNode } from '../types'
import { nodesFromRows } from './sharedParser'

export function parseXlsx(buffer: ArrayBuffer): TaxonomyNode[] {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, {
    defval: '',
  })
  return nodesFromRows(rows)
}
