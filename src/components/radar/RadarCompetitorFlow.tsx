import { useMemo } from 'react'
import { Activity } from 'lucide-react'
import { competitorSeries } from '@/features/priceWatch/dashboard/analytics'
import type { KpiHistoryPoint } from '@/features/priceWatch/types'
import { RadarSparkline } from './RadarSparkline'
import { fmtGapPct } from '@/features/priceWatch/radar/radarFormat'
import { t } from '@/lib/i18n'

/** Remplace les trous (null) par la dernière valeur connue ; retire les null de tête. */
function forwardFill(points: (number | null)[]): number[] {
  const out: number[] = []
  let last: number | null = null
  for (const p of points) {
    if (p != null) last = p
    if (last != null) out.push(last)
  }
  return out
}

/** Flux des écarts par concurrent : évolution de l'écart moyen dans le temps (history[].comp). */
export function RadarCompetitorFlow({ history, sites }: {
  history: KpiHistoryPoint[]
  sites: { siteId: string; domain: string }[]
}) {
  const flow = useMemo(() => competitorSeries(history, sites), [history, sites])
  const rows = flow.series
    .map((s) => ({ ...s, filled: forwardFill(s.points) }))
    .filter((s) => s.filled.length >= 2)
    .sort((a, b) => a.filled[a.filled.length - 1] - b.filled[b.filled.length - 1])

  if (rows.length === 0) {
    return (
      <section className="radar-card radar-in px-5 py-8 text-center text-[13px]" style={{ color: 'var(--radar-text-2)' }}>
        Pas encore assez d'historique pour tracer le flux des écarts. Reviens après quelques analyses.
      </section>
    )
  }

  return (
    <section className="radar-card radar-in px-4 py-4">
      <div className="mb-3 flex items-center gap-2">
        <Activity size={16} color="var(--radar-accent-2)" />
        <h2 className="text-[15px] font-semibold">{t('rd.gapFlow')}</h2>
        <span className="ml-auto text-[12px]" style={{ color: 'var(--radar-text-3)' }}>{t('rd.avgGapOverTime')}</span>
      </div>
      <ul className="space-y-3">
        {rows.map((s) => {
          const cur = s.filled[s.filled.length - 1]
          const color = cur < 0 ? 'var(--radar-bad)' : 'var(--radar-good)'
          return (
            <li key={s.siteId} className="flex items-center gap-3">
              <span className="w-28 shrink-0 truncate text-[12.5px] font-medium">{s.domain}</span>
              <div className="h-7 flex-1">
                <RadarSparkline values={s.filled} height={28} stroke={color} area leadingDot ariaLabel={`Écart ${s.domain}`} />
              </div>
              <span className="radar-tnum w-12 shrink-0 text-right text-[13px] font-semibold" style={{ color }}>{fmtGapPct(cur)}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
