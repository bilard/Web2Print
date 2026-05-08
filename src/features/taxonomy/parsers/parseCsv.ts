// src/features/taxonomy/parsers/parseCsv.ts
import * as XLSX from 'xlsx'
import type { TaxonomyNode } from '../types'
import { nodesFromRows } from './sharedParser'

function detectSeparator(content: string): string {
  const firstLine = content.split(/\r?\n/, 1)[0] ?? ''
  const candidates: Record<string, number> = {
    ',': (firstLine.match(/,/g) ?? []).length,
    ';': (firstLine.match(/;/g) ?? []).length,
    '\t': (firstLine.match(/\t/g) ?? []).length,
  }
  let best = ','
  let max = 0
  for (const [sep, count] of Object.entries(candidates)) {
    if (count > max) {
      max = count
      best = sep
    }
  }
  return best
}

export function parseCsv(content: string): TaxonomyNode[] {
  const FS = detectSeparator(content)
  const wb = XLSX.read(content, { type: 'string', FS })
  if (!wb.SheetNames.length) return []
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, {
    defval: '',
  })
  return nodesFromRows(rows)
}
