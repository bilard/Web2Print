import { Database, Timer, Gauge, RefreshCw } from 'lucide-react'
import type { OpsCockpit } from '@/features/priceWatch/dashboard/opsMetrics'
import { fmtInt, fmtPct, fmtDuration, timeAgo } from '@/features/priceWatch/radar/radarFormat'
import { isCursorDomain } from '@/features/priceWatch/radar/scrapeState'

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

/** Les 4 compteurs de collecte (fiches, balayage, temps de moisson, dernière collecte) —
 *  bloc partagé par l'onglet « Collecte » et l'onglet « Positionnement », comme dans le
 *  Cockpit opérationnel de l'app. */
export function RadarCollectStats({ ops }: { ops: OpsCockpit }) {
  // Un doc curseur de recherche dirigée n'est pas un concurrent : jamais affiché comme tel.
  const lastDomain = isCursorDomain(ops.lastCollectDomain) ? undefined : ops.lastCollectDomain ?? undefined
  return (
    <section className="radar-in grid grid-cols-2 gap-3 landscape:grid-cols-4">
      <Stat icon={<Database size={13} />} label="Fiches" value={fmtInt(ops.totalIndexed)} sub={`${ops.sitesActive}/${ops.sitesTotal} sites actifs`} />
      <Stat icon={<Gauge size={13} />} label="Familles" value={fmtPct(ops.avgProgress * 100)} sub={`${ops.cyclesDone} cycle(s) bouclé(s)`} />
      <Stat icon={<Timer size={13} />} label="Temps moisson" value={fmtDuration(ops.totalCumulMs)} sub={ops.slowestCycle ? `goulot ${ops.slowestCycle.domain}` : 'cumul toutes passes'} />
      <Stat icon={<RefreshCw size={13} />} label="Dernière collecte" value={ops.lastCollectAt ? timeAgo(ops.lastCollectAt) : '—'} sub={lastDomain} />
    </section>
  )
}
