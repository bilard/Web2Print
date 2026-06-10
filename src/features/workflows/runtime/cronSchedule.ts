// src/features/workflows/runtime/cronSchedule.ts
// Helpers purs pour la planification (node "Cron"). Aucune dépendance React /
// Firebase → testables isolément.

export type CronUnit = 'minute' | 'hour' | 'day' | 'week' | 'month'

export interface CronConfig {
  /** Multiplicateur d'intervalle (N unités). >= 1. */
  every: number
  unit: CronUnit
  /** Si vrai, le scheduler relance le workflow à la cadence configurée. */
  enabled: boolean
}

export const CRON_UNIT_OPTIONS: { value: CronUnit; label: string }[] = [
  { value: 'minute', label: 'minute(s)' },
  { value: 'hour', label: 'heure(s)' },
  { value: 'day', label: 'jour(s)' },
  { value: 'week', label: 'semaine(s)' },
  { value: 'month', label: 'mois' },
]

/** Limite réelle de setTimeout (~24,8 jours). Au-delà il déborde et tire immédiatement. */
export const MAX_TIMEOUT = 2_147_483_647

const FIXED_MS: Record<Exclude<CronUnit, 'month'>, number> = {
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 604_800_000,
}

/** Garantit un entier >= 1 (un cron « toutes les 0 unité » n'a pas de sens). */
export function normalizeEvery(every: number): number {
  return Number.isFinite(every) && every >= 1 ? Math.floor(every) : 1
}

/**
 * Instant (ms epoch) de la prochaine exécution à partir de `from`.
 * Les mois utilisent l'arithmétique calendaire (longueurs variables) ; les
 * autres unités sont des multiples fixes de millisecondes.
 */
export function computeNextRun(cfg: CronConfig, from: number): number {
  const every = normalizeEvery(cfg.every)
  if (cfg.unit === 'month') {
    const d = new Date(from)
    d.setMonth(d.getMonth() + every)
    return d.getTime()
  }
  return from + FIXED_MS[cfg.unit] * every
}

/** Libellé court de la cadence — ex : « 2 jour(s) », « 1 mois ». */
export function describeCron(cfg: CronConfig): string {
  const every = normalizeEvery(cfg.every)
  const unit = CRON_UNIT_OPTIONS.find((u) => u.value === cfg.unit)?.label ?? cfg.unit
  return `${every} ${unit}`
}

/**
 * setTimeout robuste aux délais supérieurs à MAX_TIMEOUT : re-planifie par
 * tranches jusqu'à atteindre `at`. Renvoie une fonction d'annulation.
 */
export function scheduleAt(
  at: number,
  cb: () => void,
  now: () => number = Date.now,
): () => void {
  let handle: ReturnType<typeof setTimeout>
  let cancelled = false
  const tick = (): void => {
    if (cancelled) return
    const remaining = at - now()
    if (remaining <= 0) {
      cb()
      return
    }
    handle = setTimeout(tick, Math.min(remaining, MAX_TIMEOUT))
  }
  tick()
  return () => {
    cancelled = true
    clearTimeout(handle)
  }
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
