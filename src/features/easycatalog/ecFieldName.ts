// src/features/easycatalog/ecFieldName.ts
import type { ExcelColumn } from '@/features/excel/types'

/** Assainit un libellé en nom de champ EasyCatalog : garde lettres/chiffres (accents inclus), collapse le reste en '_'. */
export function sanitizeEcName(label: string): string {
  const cleaned = (label ?? '')
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
  return cleaned || 'field'
}

/** Construit un ecFieldName stable et unique par clé de colonne. */
export function buildEcFieldNames(columns: ExcelColumn[]): Map<string, string> {
  const result = new Map<string, string>()
  const used = new Set<string>()
  const canonicalByLower = new Map<string, string>()
  for (const col of columns) {
    const rawBase = sanitizeEcName(col.label || col.key)
    const lower = rawBase.toLowerCase()
    const base = canonicalByLower.get(lower) ?? rawBase
    if (!canonicalByLower.has(lower)) canonicalByLower.set(lower, rawBase)
    let name = base
    let n = 2
    while (used.has(name.toLowerCase())) {
      name = `${base}_${n}`
      n++
    }
    used.add(name.toLowerCase())
    result.set(col.key, name)
  }
  return result
}
