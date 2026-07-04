// src/features/excel/numberParse.ts
// Parse une valeur de cellule en nombre, tolérant les DEUX conventions :
// FR (« 1 199,00 », virgule décimale) et EN (« 1,199.00 » / « 24.90 », point
// décimal). L'ancien parseur supprimait TOUS les points comme séparateurs de
// milliers → « 24.90 » devenait 2490. Règle : le DERNIER séparateur [.,] est
// la décimale, sauf s'il est répété seul (« 1.234.567 » → milliers).
import type { CellValue } from './types'

export function parseCellNumber(value: CellValue): number | null {
  if (typeof value === 'number') return value
  if (typeof value !== 'string') return null
  const s = value.replace(/[€$£%\s\u00A0\u202F]/g, '')
  if (!s) return null
  const lastDot = s.lastIndexOf('.')
  const lastComma = s.lastIndexOf(',')
  const count = (ch: string) => s.split(ch).length - 1
  let cleaned: string
  if (lastComma > lastDot) {
    cleaned = count(',') > 1 && lastDot === -1
      ? s.replace(/,/g, '') // « 1,234,567 » → virgules = milliers
      : s.slice(0, lastComma).replace(/[.,]/g, '') + '.' + s.slice(lastComma + 1)
  } else if (lastDot >= 0) {
    cleaned = count('.') > 1 && lastComma === -1
      ? s.replace(/\./g, '') // « 1.234.567 » → points = milliers
      : s.slice(0, lastDot).replace(/[.,]/g, '') + '.' + s.slice(lastDot + 1)
  } else {
    cleaned = s
  }
  const num = parseFloat(cleaned)
  return Number.isNaN(num) ? null : num
}
