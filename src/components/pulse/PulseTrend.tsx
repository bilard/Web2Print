import { useMemo, useState, type PointerEvent } from 'react'
import { PulseSparkline } from './PulseSparkline'
import { pulseTrendSeries } from '@/features/analytics/pulseFormat'
import type { AnalyticsEvent } from '@/features/analytics/metrics'

interface PulseTrendProps {
  events: AnalyticsEvent[]
  fromMs: number
  toMs: number
  hourly: boolean
}

/** Carte Tendance : aire des visiteurs sur la période, scrutable au doigt. */
export function PulseTrend({ events, fromMs, toMs, hourly }: PulseTrendProps) {
  const series = useMemo(() => pulseTrendSeries(events, fromMs, toMs, hourly), [events, fromMs, toMs, hourly])
  const visitors = series.map((p) => p.visitors)
  const connections = series.map((p) => p.connections)
  const total = visitors.reduce((a, b) => a + b, 0)
  const peak = Math.max(0, ...visitors)
  // Cumul des connexions = dernière valeur de la courbe (total de la période).
  const totalConn = series.length ? series[series.length - 1].connections : 0
  const [sel, setSel] = useState<number | null>(null)
  const n = series.length

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    setSel(n <= 1 ? 0 : Math.round(f * (n - 1)))
  }
  const point = sel !== null ? series[sel] : null
  const leftPct = sel !== null && n > 1 ? (sel / (n - 1)) * 100 : 0

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 className="text-[15px] font-semibold">Tendance</h2>
        <span className="text-[12px]" style={{ color: 'var(--pulse-text-3)' }}>
          <span style={{ color: '#f59e0b' }}>{totalConn} connexions</span> · {total} visiteur{total > 1 ? 's' : ''} · pic {peak}
        </span>
      </div>
      <div className="pulse-card px-3 pt-3 pb-2">
        <div
          className="relative h-28 touch-none"
          onPointerDown={onMove}
          onPointerMove={onMove}
          onPointerLeave={() => setSel(null)}
        >
          <PulseSparkline values={visitors} height={64} area strokeWidth={2.25} ariaLabel="Visiteurs par jour" className="absolute inset-0" />
          {/* Cumul des connexions superposé (ambre) : grimpe jusqu'au total de la période. */}
          <PulseSparkline values={connections} height={64} stroke="#f59e0b" strokeWidth={1.75} ariaLabel="Connexions cumulées" className="absolute inset-0" />
          {point && (
            <>
              <div className="absolute inset-y-0 w-px" style={{ left: `${leftPct}%`, background: 'var(--pulse-hair-2)' }} />
              <div
                className="pulse-card absolute -translate-x-1/2 whitespace-nowrap px-2.5 py-1.5 text-center"
                style={{ left: `min(max(${leftPct}%, 44px), calc(100% - 44px))`, top: 0 }}
              >
                <div className="pulse-tnum text-[15px] font-semibold leading-tight">{point.visitors}</div>
                <div className="pulse-tnum text-[12px] font-semibold leading-tight" style={{ color: '#f59e0b' }}>{point.connections} cum.</div>
                <div className="text-[11px]" style={{ color: 'var(--pulse-text-3)' }}>{point.label}</div>
              </div>
            </>
          )}
        </div>
        <div className="mt-1 flex justify-between px-1 text-[11px]" style={{ color: 'var(--pulse-text-3)' }}>
          <span>{series[0]?.label}</span>
          <span>{series[n - 1]?.label}</span>
        </div>
      </div>
    </section>
  )
}
