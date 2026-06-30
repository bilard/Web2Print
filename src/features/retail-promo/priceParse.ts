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

/** Formate un prix. `euroSep` : le symbole \u20ac sert de s\u00e9parateur d\u00e9cimal (327\u20ac78) si la devise est l'euro. */
export function formatPrice(n: number, currency: string, euroSep = false): string {
  const sym = SYMBOLS[currency] ?? currency
  if (euroSep && sym === '\u20ac') {
    const v = Math.round(Math.abs(n) * 100)
    const euros = new Intl.NumberFormat('fr-FR').format(Math.floor(v / 100)).replace(/[\u00a0\u202f]/g, ' ')
    return `${n < 0 ? '-' : ''}${euros}\u20ac${String(v % 100).padStart(2, '0')}`
  }
  const body = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
    .replace(/[\u00a0\u202f]/g, ' ')
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
