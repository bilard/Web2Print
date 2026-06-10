// functions/src/workflow/cronSchedule.ts
type CronUnit = 'minute' | 'hour' | 'day' | 'week' | 'month'

export interface CronConfig {
  every: number
  unit: CronUnit
  enabled: boolean
  /** 'HH:MM' — heure de déclenchement (jour/semaine/mois), fuseau Europe/Paris. */
  atTime?: string
  /** 0=dimanche … 6=samedi — jour cible de l'unité 'week'. */
  weekday?: number
}

/** Fuseau d'ancrage de l'horloge murale (« 14:30 » = 14:30 à Paris, été comme hiver). */
const TZ = 'Europe/Paris'

export function normalizeEvery(every: number): number {
  return Number.isFinite(every) && every >= 1 ? Math.floor(every) : 1
}

interface TzParts { y: number; mo: number; d: number; h: number; mi: number; weekday: number }

/** Décompose un instant epoch en parties d'horloge murale Europe/Paris. */
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

/** Décalage (minutes) d'Europe/Paris à l'instant ts (heure locale − UTC). */
function tzOffsetMinutes(ts: number): number {
  const p = tzParts(ts)
  const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi)
  return Math.round((asUtc - ts) / 60000)
}

/** Horloge murale Europe/Paris → epoch ms (corrige les bascules d'heure d'été/hiver). */
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
 *  - hour : intervalle fixe (pas d'ancrage horloge).
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
    const target = ((Math.trunc(Number(cfg.weekday ?? p.weekday)) % 7) + 7) % 7
    const delta = (target - p.weekday + 7) % 7
    for (let k = 0; k < 1000; k++) {
      const cand = parisWallToEpoch(p.y, p.mo, p.d + delta + every * 7 * k, h, mi)
      if (cand > from) return cand
    }
    return from + 604_800_000 * every
  }

  // month — même quantième, à atTime, N mois plus tard (rollover JS standard).
  for (let k = 0; k < 1000; k++) {
    const cand = parisWallToEpoch(p.y, p.mo + every * k, p.d, h, mi)
    if (cand > from) return cand
  }
  const d = new Date(from)
  d.setUTCMonth(d.getUTCMonth() + every)
  return d.getTime()
}
