import { useMemo } from 'react'
import { deviceSplit } from '@/features/analytics/pulseFormat'
import type { AnalyticsEvent } from '@/features/analytics/metrics'

/** Répartition des visites par appareil : barre empilée + légende chiffrée.
 *  Palette catégorielle validée (dataviz) ; identité portée par la légende, jamais par la couleur seule. */
export function PulseDeviceSplit({ events }: { events: AnalyticsEvent[] }) {
  const split = useMemo(() => deviceSplit(events), [events])
  const total = split.reduce((a, d) => a + d.count, 0)
  if (total === 0) return null

  return (
    <div className="pulse-card mt-3 px-4 py-3.5">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[13px] font-medium" style={{ color: 'var(--pulse-text-2)' }}>Appareils</span>
      </div>
      <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full">
        {split.map((d) => (
          <div key={d.kind} style={{ width: `${(d.count / total) * 100}%`, background: d.color }} title={`${d.label} · ${d.count}`} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {split.map((d) => (
          <li key={d.kind} className="flex items-center gap-1.5 text-[12px]">
            <span className="h-2 w-2 rounded-sm" style={{ background: d.color }} aria-hidden />
            <span style={{ color: 'var(--pulse-text-2)' }}>{d.label}</span>
            <span className="pulse-tnum font-semibold">{Math.round((d.count / total) * 100)} %</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
