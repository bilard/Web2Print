const FORMATTER = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Formate un nombre en euros au format français : "1 234,56 €". */
export function formatPrice(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  return FORMATTER.format(value)
}
