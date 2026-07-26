import { useMemo, useState } from 'react'

export type PeriodKey = 'today' | '7d' | '30d' | '90d' | '12m' | 'custom'
const DAY = 86_400_000
const SPAN: Record<Exclude<PeriodKey, 'today' | 'custom'>, number> = {
  '7d': 7 * DAY,
  '30d': 30 * DAY,
  '90d': 90 * DAY,
  '12m': 365 * DAY,
}

/**
 * Fenêtre temporelle du dashboard analytics. Trois modes :
 * - `today` : depuis minuit (heure locale) jusqu'à maintenant, `isLive` = true ;
 *   la période de comparaison = hier sur la même tranche horaire écoulée ;
 * - preset (`7d`…`12m`) : fenêtre glissante finissant maintenant, `isLive` = true
 *   (borne haute ouverte pour capter le direct) ;
 * - `custom` : plage fixe `customFrom`/`customTo` (dates `YYYY-MM-DD`), `isLive` = false.
 * `prev*` = période précédente de même durée (pour les deltas).
 */
export function usePeriod(initial: PeriodKey = '30d') {
  const [period, setPeriod] = useState<PeriodKey>(initial)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const range = useMemo(() => {
    if (period === 'custom' && customFrom && customTo) {
      const fromMs = new Date(`${customFrom}T00:00:00`).getTime()
      const toMs = new Date(`${customTo}T23:59:59.999`).getTime()
      if (Number.isFinite(fromMs) && Number.isFinite(toMs) && toMs > fromMs) {
        const span = toMs - fromMs
        return { fromMs, toMs, prevFromMs: fromMs - span, prevToMs: fromMs, isLive: false }
      }
    }
    const toMs = Date.now()
    if (period === 'today') {
      const midnight = new Date()
      midnight.setHours(0, 0, 0, 0)
      const fromMs = midnight.getTime()
      // Comparaison équitable : hier sur la même tranche horaire déjà écoulée aujourd'hui.
      const span = Math.max(toMs - fromMs, 1)
      return { fromMs, toMs, prevFromMs: fromMs - span, prevToMs: fromMs, isLive: true }
    }
    const span = SPAN[period === 'custom' ? '30d' : period]
    return { fromMs: toMs - span, toMs, prevFromMs: toMs - 2 * span, prevToMs: toMs - span, isLive: true }
  }, [period, customFrom, customTo])

  return { period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo, ...range }
}
