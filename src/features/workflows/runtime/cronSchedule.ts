// src/features/workflows/runtime/cronSchedule.ts
// Helpers purs pour la planification (node "Cron"). Aucune dépendance React /
// Firebase → testables isolément. ⚠️ La logique de `computeNextRun` doit rester
// IDENTIQUE à celle du serveur (functions/src/workflow/cronSchedule.ts) : le
// client écrit `nextRunAt` à la sauvegarde, le scanner serveur le recalcule.

export type CronUnit = 'minute' | 'hour' | 'day' | 'week' | 'month'

export interface CronConfig {
  /** Multiplicateur d'intervalle (N unités). >= 1. */
  every: number
  unit: CronUnit
  /** Si vrai, le scheduler relance le workflow à la cadence configurée. */
  enabled: boolean
  /** 'HH:MM' — heure de déclenchement (jour/semaine/mois), fuseau Europe/Paris. */
  atTime?: string
  /** 0=dimanche … 6=samedi — jour cible de l'unité 'week'. */
  weekday?: number
  /** Mode « scraping continu » : prochain run planifié `every`×`unit` APRÈS la FIN du
   *  run précédent (pas de cadence fixe). `atTime`/`weekday` ignorés. */
  afterCompletion?: boolean
}

/** Fuseau d'ancrage de l'horloge murale (« 14:30 » = 14:30 à Paris). */
const TZ = 'Europe/Paris'

const CRON_UNIT_OPTIONS: { value: CronUnit; label: string }[] = [
  { value: 'minute', label: 'minute(s)' },
  { value: 'hour', label: 'heure(s)' },
  { value: 'day', label: 'jour(s)' },
  { value: 'week', label: 'semaine(s)' },
  { value: 'month', label: 'mois' },
]

const WEEKDAY_LABELS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

/** Garantit un entier >= 1 (un cron « toutes les 0 unité » n'a pas de sens). */
export function normalizeEvery(every: number): number {
  return Number.isFinite(every) && every >= 1 ? Math.floor(every) : 1
}

interface TzParts { y: number; mo: number; d: number; h: number; mi: number; weekday: number }

function tzParts(ts: number): TzParts {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  }).formatToParts(new Date(ts))
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? ''
  const wd: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const hour = get('hour')
  return {
    y: Number(get('year')), mo: Number(get('month')), d: Number(get('day')),
    h: hour === '24' ? 0 : Number(hour), mi: Number(get('minute')),
    weekday: wd[get('weekday')] ?? 0,
  }
}

function tzOffsetMinutes(ts: number): number {
  const p = tzParts(ts)
  const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi)
  return Math.round((asUtc - ts) / 60000)
}

/** Horloge murale Europe/Paris → epoch ms (corrige les bascules d'heure été/hiver). */
function parisWallToEpoch(y: number, mo: number, d: number, h: number, mi: number): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  const off1 = tzOffsetMinutes(guess)
  let epoch = guess - off1 * 60000
  const off2 = tzOffsetMinutes(epoch)
  if (off2 !== off1) epoch = guess - off2 * 60000
  return epoch
}

/** Parse 'HH:MM' (défaut 09:00 si invalide). */
function parseAtTime(s: string | undefined): { h: number; mi: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? '').trim())
  if (!m) return { h: 9, mi: 0 }
  return { h: Math.min(23, Math.max(0, Number(m[1]))), mi: Math.min(59, Math.max(0, Number(m[2]))) }
}

/**
 * Instant (ms epoch) de la prochaine exécution strictement après `from`.
 *  - minute/hour : intervalle fixe (pas d'ancrage horloge).
 *  - day/week/month : ancré sur l'horloge murale Europe/Paris à `atTime`
 *    (et au `weekday` choisi pour l'unité 'week').
 */
export function computeNextRun(cfg: CronConfig, from: number): number {
  const every = normalizeEvery(cfg.every)
  if (cfg.unit === 'minute') return from + 60_000 * every
  if (cfg.unit === 'hour') return from + 3_600_000 * every

  const { h, mi } = parseAtTime(cfg.atTime)
  const p = tzParts(from)

  if (cfg.unit === 'day') {
    for (let k = 0; k < 1000; k++) {
      const cand = parisWallToEpoch(p.y, p.mo, p.d + every * k, h, mi)
      if (cand > from) return cand
    }
    return from + 86_400_000 * every
  }

  if (cfg.unit === 'week') {
    const wd = Number(cfg.weekday ?? p.weekday)
    // weekday < 0 = « Tous les jours » → cadence quotidienne à atTime.
    if (wd < 0) {
      for (let k = 0; k < 1000; k++) {
        const cand = parisWallToEpoch(p.y, p.mo, p.d + k, h, mi)
        if (cand > from) return cand
      }
      return from + 86_400_000
    }
    const target = ((Math.trunc(wd) % 7) + 7) % 7
    const delta = (target - p.weekday + 7) % 7
    for (let k = 0; k < 1000; k++) {
      const cand = parisWallToEpoch(p.y, p.mo, p.d + delta + every * 7 * k, h, mi)
      if (cand > from) return cand
    }
    return from + 604_800_000 * every
  }

  for (let k = 0; k < 1000; k++) {
    const cand = parisWallToEpoch(p.y, p.mo + every * k, p.d, h, mi)
    if (cand > from) return cand
  }
  const d = new Date(from)
  d.setMonth(d.getMonth() + every)
  return d.getTime()
}

/** Libellé court de la cadence — ex : « 2 jour(s) à 14:30 », « lundi à 09:00 ». */
export function describeCron(cfg: CronConfig): string {
  const every = normalizeEvery(cfg.every)
  const unit = CRON_UNIT_OPTIONS.find((u) => u.value === cfg.unit)?.label ?? cfg.unit
  // Mode « après la fin » : cadence relative, l'heure/jour ne s'appliquent pas.
  if (cfg.afterCompletion) return `${every} ${unit} après la fin`
  const at = cfg.atTime && /^\d{1,2}:\d{2}$/.test(cfg.atTime) ? ` à ${cfg.atTime}` : ''
  if (cfg.unit === 'week' && cfg.weekday != null) {
    if (Number(cfg.weekday) < 0) return `tous les jours${at}`
    const wd = WEEKDAY_LABELS[((Math.trunc(Number(cfg.weekday)) % 7) + 7) % 7]
    return every === 1 ? `${wd}${at}` : `${every} sem. (${wd})${at}`
  }
  if (cfg.unit === 'day' || cfg.unit === 'month') return `${every} ${unit}${at}`
  return `${every} ${unit}`
}

/** Compte à rebours lisible — ex : « 2 j 3 h », « 5 min 12 s », « maintenant ». */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return 'maintenant'
  const total = Math.floor(ms / 1000)
  const d = Math.floor(total / 86400)
  const h = Math.floor((total % 86400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (d > 0) return `${d} j ${h} h`
  if (h > 0) return `${h} h ${m} min`
  if (m > 0) return `${m} min ${s} s`
  return `${s} s`
}
