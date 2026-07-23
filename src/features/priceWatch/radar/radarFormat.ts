// src/features/priceWatch/radar/radarFormat.ts
// Formatteurs de la PWA « radarPrice ». PUR, sans React. isIos/isStandalone dupliqués
// (10 lignes) pour garder la surface radar auto-contenue, indépendante de la feature
// analytics (Pulse).

/** Prix HT/€ compact en français : 12,34 € ; null → tiret. */
export function fmtEur(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—'
  return `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}

/** Somme € arrondie sans décimales pour les grands totaux (impact). */
export function fmtEurCompact(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—'
  return `${Math.round(v).toLocaleString('fr-FR')} €`
}

/** Pourcentage arrondi avec signe explicite (écart) ; null → tiret. */
export function fmtGapPct(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—'
  const r = Math.round(v)
  return `${r > 0 ? '+' : ''}${r} %`
}

/** Pourcentage simple sans signe (taux, tenue) ; null → tiret. */
export function fmtPct(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—'
  return `${Math.round(v)} %`
}

/** Nombre entier avec séparateur de milliers fr. */
export function fmtInt(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—'
  return Math.round(v).toLocaleString('fr-FR')
}

/** Temps relatif court en français (« à l'instant », « il y a 4 min », « 14:32 »…). */
export function timeAgo(ms: number | null | undefined, now: number = Date.now()): string {
  if (ms == null) return '—'
  const d = Math.max(0, now - ms)
  const min = Math.floor(d / 60_000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h} h`
  const days = Math.floor(h / 24)
  if (days === 1) return 'hier'
  if (days < 7) return `il y a ${days} j`
  return new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

/** Durée compacte depuis des ms (« 2 h 05 », « 45 min », « 12 s ») ; 0/null → tiret. */
export function fmtDuration(ms: number | null | undefined): string {
  if (ms == null || ms <= 0) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return `${h} h ${String(m % 60).padStart(2, '0')}`
}

/** Heure « 14:32 » (dernier run). */
export function hhmm(ms: number | null | undefined): string {
  if (ms == null) return '—'
  return new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

/** Vrai si l'app tourne en mode installé (écran d'accueil iOS ou display-mode standalone). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches
}

/** Vrai sur iPhone/iPad (pour n'afficher l'astuce « Ajouter à l'écran d'accueil » que là). */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && (navigator as unknown as { maxTouchPoints: number }).maxTouchPoints > 1)
}
