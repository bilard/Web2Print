import { timeSeries, type AnalyticsEvent } from './metrics'

/** Emoji drapeau à partir d'un code pays ISO-3166 alpha-2 (ex. « FR » → 🇫🇷). */
export function flagEmoji(iso: string | null): string {
  if (!iso || iso.length !== 2 || !/^[a-z]{2}$/i.test(iso)) return '🌐'
  const base = 0x1f1e6
  const cc = iso.toUpperCase()
  return String.fromCodePoint(base + (cc.charCodeAt(0) - 65), base + (cc.charCodeAt(1) - 65))
}

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(['fr'], { type: 'region' })
  } catch {
    return null
  }
})()

/** Nom de pays en clair (français) depuis un code ISO-3166 alpha-2 (« FR » → « France »). */
export function countryName(iso: string | null): string | null {
  if (!iso) return null
  if (iso.length !== 2 || !/^[a-z]{2}$/i.test(iso)) return iso
  try {
    return regionNames?.of(iso.toUpperCase()) ?? iso
  } catch {
    return iso
  }
}

/** Temps relatif court en français (« à l'instant », « il y a 4 min », « 14:32 », « hier »). */
export function timeAgo(ms: number, now: number = Date.now()): string {
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

/** Delta formaté avec signe (ex. +12 % / −8 %) ; `null` → tiret. */
export function fmtDelta(pct: number | null): { text: string; dir: 'up' | 'down' | 'flat' } {
  if (pct === null || pct === 0) return { text: '—', dir: 'flat' }
  const dir = pct > 0 ? 'up' : 'down'
  return { text: `${pct > 0 ? '+' : '−'}${Math.abs(pct)} %`, dir }
}

export type DeviceKind = AnalyticsEvent['device']

/** Répartition des visites par type d'appareil, ordre catégoriel fixe (mobile, ordinateur, tablette). */
export function deviceSplit(events: AnalyticsEvent[]): { kind: DeviceKind; label: string; count: number; color: string }[] {
  const counts: Record<DeviceKind, number> = { mobile: 0, desktop: 0, tablet: 0 }
  for (const e of events) counts[e.device] = (counts[e.device] ?? 0) + 1
  return [
    { kind: 'mobile' as const, label: 'Mobile', count: counts.mobile, color: 'var(--pulse-cat-1)' },
    { kind: 'desktop' as const, label: 'Ordinateur', count: counts.desktop, color: 'var(--pulse-cat-2)' },
    { kind: 'tablet' as const, label: 'Tablette', count: counts.tablet, color: 'var(--pulse-cat-3)' },
  ].filter((d) => d.count > 0)
}

export interface TrendPoint {
  label: string
  visitors: number
  pageViews: number
}

const HOUR = 3_600_000

/** Série pour la carte Tendance : horaire (24 points) si `hourly`, sinon quotidienne. */
export function pulseTrendSeries(events: AnalyticsEvent[], fromMs: number, toMs: number, hourly: boolean): TrendPoint[] {
  if (hourly) {
    const start = toMs - 24 * HOUR
    const buckets = Array.from({ length: 24 }, () => ({ pv: 0, vids: new Set<string>() }))
    for (const e of events) {
      if (e.ts < start) continue
      const i = Math.min(23, Math.floor((e.ts - start) / HOUR))
      if (i < 0) continue
      buckets[i].pv += 1
      buckets[i].vids.add(e.vid)
    }
    return buckets.map((b, i) => ({
      label: `${new Date(start + i * HOUR).getHours()}h`,
      visitors: b.vids.size,
      pageViews: b.pv,
    }))
  }
  return timeSeries(events, fromMs, toMs).map((d) => ({
    label: new Date(d.day).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
    visitors: d.visitors,
    pageViews: d.pageViews,
  }))
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
