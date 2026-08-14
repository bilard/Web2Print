// Un seul formateur pour tout le module : deux règles d'arrondi différentes sur le même
// écran suffisent à faire douter de tous les chiffres.
import type { MeasureFormat } from '../registry/types'

export function formatMeasure(
  value: number | string | null,
  format: MeasureFormat = 'float',
  locale = 'fr-FR',
): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'string') return value
  switch (format) {
    case 'int':   return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)
    case 'eur':   return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(value)
    case 'pct':   return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} %`
    case 'ms':    return value < 1000
      ? `${Math.round(value)} ms`
      : value < 60_000 ? `${(value / 1000).toFixed(1).replace('.', ',')} s`
      : `${Math.round(value / 60_000)} min`
    case 'float': return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)
  }
}
