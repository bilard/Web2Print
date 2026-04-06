import type { FieldTypeId, CellValue } from './types'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const URL_RE = /^https?:\/\/.+/i
const PHONE_RE = /^[+]?[\d\s().-]{7,20}$/
const DATE_RE = /^\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}$/
const PERCENT_RE = /^-?\d+([.,]\d+)?%$/
const CURRENCY_RE = /^[$€£¥]\s?-?\d|^\d+([.,]\d+)?\s?[$€£¥]|^-?\d+([.,]\d+)?\s?(EUR|USD|GBP)/i
const DURATION_RE = /^\d{1,3}:\d{2}(:\d{2})?$/
const BOOL_VALUES = new Set(['true', 'false', 'oui', 'non', 'yes', 'no', '0', '1', 'vrai', 'faux'])

function isNumber(v: string): boolean {
  return !isNaN(Number(v.replace(',', '.'))) && v.trim() !== ''
}

function detectSingleValue(value: CellValue): FieldTypeId | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'boolean') return 'checkbox'
  if (typeof value === 'number') return 'number'

  const s = String(value).trim()
  if (s === '') return null

  if (CURRENCY_RE.test(s)) return 'currency'
  if (PERCENT_RE.test(s)) return 'percent'
  if (EMAIL_RE.test(s)) return 'email'
  if (URL_RE.test(s)) return 'url'
  if (PHONE_RE.test(s) && !isNumber(s)) return 'phone'
  if (DURATION_RE.test(s)) return 'duration'
  if (DATE_RE.test(s)) return 'date'
  if (BOOL_VALUES.has(s.toLowerCase())) return 'checkbox'
  if (isNumber(s)) return 'number'

  // Long text detection
  if (s.length > 100) return 'text_long'
  if (s.includes('\n')) return 'text_long'

  return 'text'
}

export function detectColumnType(values: CellValue[]): FieldTypeId {
  const nonEmpty = values.filter((v) => v !== null && v !== undefined && v !== '')
  if (nonEmpty.length === 0) return 'text'

  const detected = nonEmpty.map(detectSingleValue).filter(Boolean) as FieldTypeId[]
  if (detected.length === 0) return 'text'

  // Count type occurrences
  const counts = new Map<FieldTypeId, number>()
  for (const t of detected) {
    counts.set(t, (counts.get(t) ?? 0) + 1)
  }

  // Check if all unique values are limited (potential select)
  const uniqueValues = new Set(nonEmpty.map(String))
  const uniqueRatio = uniqueValues.size / nonEmpty.length
  if (uniqueRatio < 0.3 && uniqueValues.size <= 20 && uniqueValues.size >= 2) {
    // Check if multiple values per cell (comma-separated)
    const hasMultiValues = nonEmpty.some((v) => String(v).includes(',') && !isNumber(String(v).replace(',', '.')))
    if (hasMultiValues) return 'select_multiple'
    return 'select_single'
  }

  // Return the most common type (with priority for specifics over text)
  let bestType: FieldTypeId = 'text'
  let bestCount = 0
  const priority: FieldTypeId[] = ['currency', 'percent', 'email', 'url', 'phone', 'date', 'duration', 'checkbox', 'number', 'text_long', 'text']

  for (const t of priority) {
    const c = counts.get(t) ?? 0
    // Need at least 60% match for specific types
    if (c > bestCount && c / detected.length >= 0.6) {
      bestType = t
      bestCount = c
    }
  }

  return bestType
}

export function computeColumnStats(values: CellValue[], fieldType: FieldTypeId) {
  const nonEmpty = values.filter((v) => v !== null && v !== undefined && v !== '')

  const stats = {
    min: null as number | string | null,
    max: null as number | string | null,
    avg: null as number | null,
    count: values.length,
    empty: values.length - nonEmpty.length,
    unique: new Set(nonEmpty.map(String)).size,
  }

  if (['number', 'currency', 'percent', 'rating'].includes(fieldType)) {
    const nums = nonEmpty
      .map((v) => {
        const s = String(v).replace(/[$€£¥%\s]/g, '').replace(',', '.')
        return parseFloat(s)
      })
      .filter((n) => !isNaN(n))

    if (nums.length > 0) {
      stats.min = Math.min(...nums)
      stats.max = Math.max(...nums)
      stats.avg = Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100
    }
  } else if (fieldType === 'date') {
    const dates = nonEmpty.map((v) => new Date(String(v))).filter((d) => !isNaN(d.getTime()))
    if (dates.length > 0) {
      const sorted = dates.sort((a, b) => a.getTime() - b.getTime())
      stats.min = sorted[0].toLocaleDateString('fr-FR')
      stats.max = sorted[sorted.length - 1].toLocaleDateString('fr-FR')
    }
  } else if (fieldType === 'text' || fieldType === 'text_long') {
    const lengths = nonEmpty.map((v) => String(v).length)
    if (lengths.length > 0) {
      stats.min = Math.min(...lengths)
      stats.max = Math.max(...lengths)
      stats.avg = Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length)
    }
  }

  return stats
}
