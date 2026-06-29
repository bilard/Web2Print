import type { PromoMechanism } from './promoTypes'

/** Parse un prix FR tolérant : devise, espaces (incl. insécables), virgule décimale. */
export function parsePrice(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const cleaned = value
    .replace(/[\s  ]/g, '')
    .replace(/[€$£]/g, '')
    .replace(',', '.')
    .replace(/[^0-9.\-]/g, '')
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

const SYMBOLS: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' }

export function formatPrice(n: number, currency: string): string {
  const body = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
    .replace(/[  ]/g, ' ')
  const sym = SYMBOLS[currency] ?? currency
  return `${body} ${sym}`
}

export function computeMechanism(input: {
  oldPrice: number | null; newPrice: number | null
  lotQty: number | null; lotOffert: number | null; lotPrice: number | null
}): { mechanism: PromoMechanism; remisePct: number | null; remiseMontant: number | null } {
  const { oldPrice, newPrice, lotQty, lotOffert, lotPrice } = input
  let remisePct: number | null = null
  let remiseMontant: number | null = null
  if (oldPrice != null && newPrice != null && oldPrice > newPrice) {
    remiseMontant = Math.round((oldPrice - newPrice) * 100) / 100
    remisePct = Math.round(((oldPrice - newPrice) / oldPrice) * 100)
  }
  let mechanism: PromoMechanism = 'simple'
  if (lotOffert != null && lotQty != null) mechanism = 'lot'
  else if (lotPrice != null) mechanism = 'pack'
  else if (remisePct != null) mechanism = 'remise'
  return { mechanism, remisePct, remiseMontant }
}
