// src/features/analytics/usePeriod.ts
import { useMemo, useState } from 'react'

export type PeriodKey = '7d' | '30d' | '90d' | '12m'
const DAY = 86_400_000
const SPAN: Record<PeriodKey, number> = { '7d': 7 * DAY, '30d': 30 * DAY, '90d': 90 * DAY, '12m': 365 * DAY }

export function usePeriod(initial: PeriodKey = '30d') {
  const [period, setPeriod] = useState<PeriodKey>(initial)
  const range = useMemo(() => {
    const toMs = Date.now()
    const span = SPAN[period]
    return { fromMs: toMs - span, toMs, prevFromMs: toMs - 2 * span, prevToMs: toMs - span }
  }, [period])
  return { period, setPeriod, ...range }
}
