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
    // ⚠ Style `percent` d'Intl plutôt qu'un suffixe « % » codé en dur : la virgule ET
    // l'espace avant le signe sont une convention FR/ES, absente en anglais britannique
    // (« 75.5% », sans espace). Les mesures du projet rendent 0–100, `percent` attend 0–1.
    case 'pct':   return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(value / 100)
    // ⚠ Même piège sur les secondes : une virgule figée casse l'anglais et l'espagnol
    // (attendent un point) — même remède, `Intl.NumberFormat` plutôt que `toFixed`.
    case 'ms':    return value < 1000
      ? `${Math.round(value)} ms`
      : value < 60_000
        ? `${new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value / 1000)} s`
        : `${Math.round(value / 60_000)} min`
    case 'float': return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)
  }
}
