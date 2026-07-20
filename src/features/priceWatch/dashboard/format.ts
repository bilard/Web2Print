// src/features/priceWatch/dashboard/format.ts
// Formatage + sémantique de couleurs du tableau de bord Veille tarifaire.
// Convention métier : un concurrent MOINS cher que moi est une ALERTE (rose) ;
// à l'inverse, être moins cher est bon (émeraude) ; à l'équilibre = aligné (ambre).

const eurFmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export function eur(n: number | null | undefined): string {
  return n == null ? '—' : eurFmt.format(n)
}

/** Écart en points de % signé. « +12,4 % » / « −8,1 % ». */
export function pct(n: number | null | undefined): string {
  if (n == null) return '—'
  const s = Math.round(n * 10) / 10
  return `${s > 0 ? '+' : ''}${s.toLocaleString('fr-FR')} %`
}

export function when(ts: number | null | undefined): string {
  return ts ? dateFmt.format(ts) : '—'
}

type Position = 'cheaper' | 'aligned' | 'dearer'

/** Position d'un concurrent face à moi, à partir de l'écart % (bande d'alignement). */
export function positionOf(gapPct: number | null, band = 1): Position | null {
  if (gapPct == null) return null
  if (gapPct < -band) return 'cheaper' // concurrent moins cher que moi
  if (gapPct > band) return 'dearer'   // je suis moins cher
  return 'aligned'
}

/** Couleur hex (graphes chart.js) par position. */
export const POSITION_HEX: Record<Position, string> = {
  cheaper: '#fb7185', // rose — alerte
  aligned: '#fbbf24', // ambre
  dearer: '#34d399',  // émeraude — bon positionnement
}

export const POSITION_LABEL: Record<Position, string> = {
  cheaper: 'Concurrent moins cher',
  aligned: 'Aligné',
  dearer: 'Je suis moins cher',
}

/** Classe Tailwind de texte par position (cartes/listes). */
export const POSITION_TEXT: Record<Position, string> = {
  cheaper: 'text-rose-400',
  aligned: 'text-amber-400',
  dearer: 'text-emerald-400',
}

/**
 * Couleur diverging d'un écart % pour les cellules de heatmap / tableau (fond).
 * Échelle : rose (concurrent moins cher = alerte) ↔ neutre ↔ émeraude (je suis moins
 * cher). Intensité proportionnelle à |écart|, clampée à ±clamp %. Alpha modéré pour
 * garder le texte lisible par-dessus. Rendu identique en clair/sombre (superposé au fond).
 */
export function heatColor(gapPct: number | null, clamp = 25): string {
  if (gapPct == null) return 'transparent'
  const t = Math.max(-1, Math.min(1, gapPct / clamp)) // -1 (rose) .. +1 (émeraude)
  const a = Math.min(0.42, Math.abs(t) * 0.42)
  const [r, g, b] = t < 0 ? [251, 113, 133] : [52, 211, 153] // rose / émeraude
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`
}

export const STOCK_LABEL: Record<string, string> = {
  'in-stock': 'En stock', 'out-of-stock': 'Rupture', 'on-order': 'Sur commande',
}

export const MATCH_LABEL: Record<string, string> = {
  'exact-ean': 'EAN', 'exact-ref': 'Référence', origin: "Pièce d'origine",
}
