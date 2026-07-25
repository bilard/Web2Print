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

/**
 * Unités COMPACTES, collées au nombre (« 10mn », « 50s », « 2h »). Choix assumé pour la
 * PWA : sur un écran de téléphone, l'espace insécable et le « min » complet poussent les
 * décomptes du bandeau à la ligne. L'app de bureau garde l'écriture standard (« 10 min »).
 */
export function fmtCompactDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(total / 86400)
  const h = Math.floor((total % 86400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (d > 0) return `${d}j ${h}h`
  if (h > 0) return `${h}h ${m}mn`
  if (m > 0) return `${m}mn ${s}s`
  return `${s}s`
}

/** Décompte du bandeau (« dans 26mn 59s ») — jumeau compact de `formatCountdown`. */
export function fmtCountdown(ms: number): string {
  if (ms <= 0) return 'maintenant'
  return fmtCompactDuration(ms)
}

/** Temps relatif court en français (« à l'instant », « il y a 4mn », « 14:32 »…). */
export function timeAgo(ms: number | null | undefined, now: number = Date.now()): string {
  if (ms == null) return '—'
  const d = Math.max(0, now - ms)
  const min = Math.floor(d / 60_000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min}mn`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h}h`
  const days = Math.floor(h / 24)
  if (days === 1) return 'hier'
  if (days < 7) return `il y a ${days}j`
  return new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

/** Durée compacte depuis des ms (« 2h05 », « 45mn », « 12s ») ; 0/null → tiret. */
export function fmtDuration(ms: number | null | undefined): string {
  if (ms == null || ms <= 0) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}mn`
  const h = Math.floor(m / 60)
  return `${h}h${String(m % 60).padStart(2, '0')}`
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
