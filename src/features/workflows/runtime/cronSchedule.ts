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
  /** Relance calendaire du CYCLE de moisson (veille) : quand le cycle est terminé à
   *  100 % sur tous les sites, la cadence s'arrête et le cycle complet repart à
   *  l'échéance décrite ici (au lieu d'enchaîner en continu). */
  cycle?: CycleCalendar | null
}

/** Récurrence de relance du cycle : quotidien / jours de semaine / quantième / dates précises. */
export type CycleKind = 'day' | 'week' | 'month' | 'dates'

export interface CycleCalendar {
  enabled: boolean
  kind: CycleKind
  /** 'HH:MM' — heure de relance, fuseau Europe/Paris. */
  atTime: string
  /** kind 'day' : tous les N jours · kind 'month' : tous les N mois. */
  every?: number
  /** kind 'week' : jours cochés (0=dimanche … 6=samedi), multi. */
  weekdays?: number[]
  /** kind 'month' : quantième 1..31 (clampé au dernier jour des mois courts). */
  monthday?: number
  /** kind 'dates' : dates précises 'YYYY-MM-DD' (one-shot chacune). */
  dates?: string[]
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

/** Valide/normalise une config calendrier brute (Firestore ou config de node) en
 *  `CycleCalendar` sûr, TOUS champs définis (Firestore refuse `undefined`).
 *  Renvoie null si absent ou désactivé. ⚠️ Jumeau serveur identique. */
export function sanitizeCycle(raw: unknown): CycleCalendar | null {
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>
  if (!c.enabled) return null
  const kind = (['day', 'week', 'month', 'dates'] as CycleKind[]).includes(c.kind as CycleKind)
    ? (c.kind as CycleKind) : 'day'
  const atTime = typeof c.atTime === 'string' && /^\d{1,2}:\d{2}$/.test(c.atTime) ? c.atTime : '07:00'
  const weekdays = Array.isArray(c.weekdays)
    ? [...new Set(c.weekdays.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort((a, b) => a - b)
    : []
  const dates = Array.isArray(c.dates)
    ? [...new Set(c.dates.map(String).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort()
    : []
  return {
    enabled: true, kind, atTime,
    every: normalizeEvery(Number(c.every ?? 1)),
    weekdays,
    monthday: Math.min(31, Math.max(1, Math.trunc(Number(c.monthday)) || 1)),
    dates,
  }
}

/**
 * Prochaine échéance calendaire de relance de cycle strictement après `from`
 * (horloge murale Europe/Paris à `atTime`), ou null si plus aucune échéance
 * (kind 'dates' avec toutes les dates passées). ⚠️ Jumeau serveur identique.
 */
export function computeNextCycleRun(cal: CycleCalendar, from: number): number | null {
  const { h, mi } = parseAtTime(cal.atTime)
  const p = tzParts(from)
  const every = normalizeEvery(cal.every ?? 1)

  if (cal.kind === 'dates') {
    let best: number | null = null
    for (const d of cal.dates ?? []) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d)
      if (!m) continue
      const cand = parisWallToEpoch(Number(m[1]), Number(m[2]), Number(m[3]), h, mi)
      if (cand > from && (best == null || cand < best)) best = cand
    }
    return best
  }

  if (cal.kind === 'week') {
    const days = (cal.weekdays ?? []).filter((n) => n >= 0 && n <= 6)
    // Aucun jour coché → repli quotidien (plutôt que « jamais »).
    for (let k = 0; k < 400; k++) {
      const cand = parisWallToEpoch(p.y, p.mo, p.d + k, h, mi)
      if (cand <= from) continue
      if (days.length === 0 || days.includes(tzParts(cand).weekday)) return cand
    }
    return from + 604_800_000
  }

  if (cal.kind === 'month') {
    const md = Math.min(31, Math.max(1, Math.trunc(cal.monthday ?? 1)))
    for (let k = 0; k < 60; k++) {
      const total = p.mo - 1 + every * k
      const y = p.y + Math.floor(total / 12)
      const mo = (total % 12) + 1
      // Quantième clampé au dernier jour du mois (le « 31 » vaut « fin de mois »).
      const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate()
      const cand = parisWallToEpoch(y, mo, Math.min(md, dim), h, mi)
      if (cand > from) return cand
    }
    return from + 2_592_000_000
  }

  // 'day' : tous les N jours à atTime.
  for (let k = 0; k < 1000; k++) {
    const cand = parisWallToEpoch(p.y, p.mo, p.d + every * k, h, mi)
    if (cand > from) return cand
  }
  return from + 86_400_000 * every
}

const WEEKDAY_SHORT = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']

/** Libellé court de la relance calendaire — ex : « cycle ven. à 07:00 »,
 *  « cycle le 14/10/2026 à 07:00 (+2) ». */
export function describeCycle(cal: CycleCalendar): string {
  const at = ` à ${cal.atTime}`
  const every = normalizeEvery(cal.every ?? 1)
  if (cal.kind === 'dates') {
    const dates = [...(cal.dates ?? [])].sort()
    if (dates.length === 0) return `cycle : aucune date${at}`
    const [y, mo, d] = dates[0].split('-')
    return `cycle le ${d}/${mo}/${y}${at}${dates.length > 1 ? ` (+${dates.length - 1})` : ''}`
  }
  if (cal.kind === 'week') {
    const days = cal.weekdays ?? []
    const names = days.length ? days.map((d) => WEEKDAY_SHORT[d] ?? '?').join(' ') : 'tous les jours'
    return `cycle ${names}${at}`
  }
  if (cal.kind === 'month') {
    return every === 1
      ? `cycle le ${cal.monthday ?? 1} du mois${at}`
      : `cycle le ${cal.monthday ?? 1}, ts les ${every} mois${at}`
  }
  return every === 1 ? `cycle quotidien${at}` : `cycle ts les ${every} j${at}`
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
