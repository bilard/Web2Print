import { Database, Timer, Gauge, RefreshCw } from 'lucide-react'
import type { OpsCockpit } from '@/features/priceWatch/dashboard/opsMetrics'
import { fmtInt, fmtPct, fmtDuration, timeAgo } from '@/features/priceWatch/radar/radarFormat'

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="radar-card px-4 py-3.5">
      <div className="flex items-center gap-1.5" style={{ color: 'var(--radar-text-2)' }}>
        {icon}<span className="text-[12px]">{label}</span>
      </div>
      <p className="radar-rounded radar-tnum mt-1 text-[24px] font-bold leading-none">{value}</p>
      {sub && <p className="mt-1 text-[11px]" style={{ color: 'var(--radar-text-3)' }}>{sub}</p>}
    </div>
  )
}

/** Onglet Volumétrie : combien de fiches collectées, chez qui, à quel rythme (buildOpsCockpit). */
export function RadarVolume({ ops }: { ops: OpsCockpit | null }) {
  if (!ops || !ops.hasData) {
    return (
      <div className="radar-card px-5 py-8 text-center text-[13px]" style={{ color: 'var(--radar-text-2)' }}>
        En attente de la première collecte.
      </div>
    )
  }
  const maxIndexed = Math.max(1, ...ops.competitors.map((c) => c.indexed))

  return (
    <div className="space-y-4">
      <section className="radar-in grid grid-cols-2 gap-3">
        <Stat icon={<Database size={13} />} label="Fiches" value={fmtInt(ops.totalIndexed)} sub={`${ops.sitesActive}/${ops.sitesTotal} sites actifs`} />
        <Stat icon={<Gauge size={13} />} label="Balayage" value={fmtPct(ops.avgProgress * 100)} sub={`${ops.cyclesDone} cycle(s) bouclé(s)`} />
        <Stat icon={<Timer size={13} />} label="Temps moisson" value={fmtDuration(ops.totalCumulMs)} sub={ops.slowestCycle ? `goulot ${ops.slowestCycle.domain}` : 'cumul toutes passes'} />
        <Stat icon={<RefreshCw size={13} />} label="Dernière collecte" value={ops.lastCollectAt ? timeAgo(ops.lastCollectAt) : '—'} sub={ops.lastCollectDomain ?? undefined} />
      </section>

      <section className="radar-card radar-in px-4 py-4">
        <div className="mb-2 flex items-center gap-2">
          <Database size={16} color="var(--radar-accent-2)" />
          <h2 className="text-[15px] font-semibold">Fiches par concurrent</h2>
          <span className="ml-auto text-[12px]" style={{ color: 'var(--radar-text-3)' }}>% avec prix</span>
        </div>
        <ul className="space-y-3">
          {ops.competitors.map((c) => (
            <li key={c.siteId}>
              <div className="flex items-center justify-between text-[13px]">
                <span className="truncate pr-2 font-medium">{c.domain}</span>
                <span className="radar-tnum shrink-0" style={{ color: 'var(--radar-text-2)' }}>
                  {fmtInt(c.indexed)}
                  {c.sweeps > 0 && <span style={{ color: 'var(--radar-text-3)' }}> · ×{c.sweeps}</span>}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--radar-surface-2)' }}>
                  <div className="h-full rounded-full" style={{ width: `${(c.indexed / maxIndexed) * 100}%`, background: 'var(--radar-accent)' }} />
                </div>
                <span className="radar-tnum w-11 shrink-0 text-right text-[11px]" style={{ color: c.pctPrice >= 80 ? 'var(--radar-good)' : c.pctPrice >= 40 ? 'var(--radar-warn)' : 'var(--radar-bad)' }}>
                  {fmtPct(c.pctPrice)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
