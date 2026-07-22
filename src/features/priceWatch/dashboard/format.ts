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

/** Durée lisible compacte : « 12 s », « 3 min », « 1 h 20 ». '—' si non mesurée / nulle. */
export function duration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return `${h} h ${String(m % 60).padStart(2, '0')}`
}

/** Ancienneté compacte pour les espaces étroits : « 45 s », « 3 min », « 2 h », « 4 j ». */
export function agoShort(ts: number | null | undefined, now = Date.now()): string {
  if (!ts) return '—'
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} h`
  return `${Math.floor(h / 24)} j`
}

/** Ancienneté relative : « il y a 3 min », « il y a 2 h », « il y a 4 j ». '—' si absente. */
export function ago(ts: number | null | undefined, now = Date.now()): string {
  if (!ts) return '—'
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 60) return `il y a ${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `il y a ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `il y a ${h} h`
  return `il y a ${Math.floor(h / 24)} j`
}

const compactFmt = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 })
/** Nombre compact pour les gros compteurs : 27936 → « 28 k », 1250000 → « 1,3 M ». */
export function compactNum(n: number | null | undefined): string {
  return n == null ? '—' : compactFmt.format(n)
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
