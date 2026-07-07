import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { fmtDelta } from '@/features/analytics/pulseFormat'
import type { KpiWithDelta } from '@/features/analytics/useLivePulse'

function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`
}

function DeltaChip({ pct }: { pct: number | null }) {
  const { text, dir } = fmtDelta(pct)
  if (dir === 'flat') return <span className="text-[12px]" style={{ color: 'var(--pulse-text-3)' }}>{text}</span>
  const color = dir === 'up' ? 'var(--pulse-up)' : 'var(--pulse-down)'
  const Icon = dir === 'up' ? ArrowUpRight : ArrowDownRight
  return (
    <span className="inline-flex items-center gap-0.5 text-[12px] font-semibold" style={{ color }}>
      <Icon size={13} />
      {text}
    </span>
  )
}

function Tile({ value, label, pct, hint }: { value: string; label: string; pct?: number | null; hint?: string }) {
  return (
    <div className="pulse-card flex flex-col justify-between px-4 py-3.5">
      <div className="flex items-start justify-between">
        <span className="pulse-rounded pulse-tnum text-[28px] font-bold leading-none">{value}</span>
        {pct !== undefined && <DeltaChip pct={pct} />}
      </div>
      <div className="mt-2">
        <p className="text-[13px] font-medium" style={{ color: 'var(--pulse-text-2)' }}>{label}</p>
        {hint && <p className="text-[11px]" style={{ color: 'var(--pulse-text-3)' }}>{hint}</p>}
      </div>
    </div>
  )
}

const nf = new Intl.NumberFormat('fr-FR')

/** Grille 2×2 des indicateurs clés avec variation vs période précédente. */
export function PulseKpiGrid({ kpis }: { kpis: KpiWithDelta }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Tile value={nf.format(kpis.visitors)} label="Visiteurs" pct={kpis.dVisitors} />
      <Tile value={nf.format(kpis.pageViews)} label="Pages vues" pct={kpis.dPageViews} />
      <Tile value={nf.format(kpis.sessions)} label="Sessions" pct={kpis.dSessions} />
      <Tile value={fmtDuration(kpis.avgSessionMs)} label="Durée moyenne" hint={`${Math.round(kpis.bounceRate * 100)} % rebond`} />
    </div>
  )
}
