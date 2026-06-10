// functions/src/workflow/cronSchedule.ts
export type CronUnit = 'hour' | 'day' | 'week' | 'month'

export interface CronConfig {
  every: number
  unit: CronUnit
  enabled: boolean
}

const FIXED_MS: Record<Exclude<CronUnit, 'month'>, number> = {
  hour: 3_600_000,
  day: 86_400_000,
  week: 604_800_000,
}

export function normalizeEvery(every: number): number {
  return Number.isFinite(every) && every >= 1 ? Math.floor(every) : 1
}

export function computeNextRun(cfg: CronConfig, from: number): number {
  const every = normalizeEvery(cfg.every)
  if (cfg.unit === 'month') {
    const d = new Date(from)
    d.setUTCMonth(d.getUTCMonth() + every)
    return d.getTime()
  }
  return from + FIXED_MS[cfg.unit] * every
}
