import { Radar } from 'lucide-react'
import type { Cockpit } from '@/features/priceWatch/dashboard/analytics'
import type { OpsCockpit } from '@/features/priceWatch/dashboard/opsMetrics'
import { RadarSparkline } from './RadarSparkline'
import { fmtInt, fmtPct, timeAgo } from '@/features/priceWatch/radar/radarFormat'

/** Héros : le chiffre de tête « Tenue prix » (% où je suis aligné ou moins cher) avec sa
 *  tendance, une barre de position (moins cher / aligné / je perds) et l'état de collecte. */
export function RadarHero({ cockpit, holdSeries, ops, collectActive }: {
  cockpit: Cockpit
  holdSeries: number[]
  ops: OpsCockpit | null
  /** « Ça tourne » calculé par scrapeStatus (planning + battement) — source UNIQUE :
   *  la fenêtre locale de 5 min laissait le point vert respirer après un STOP. */
  collectActive: boolean
}) {
  const { kpis, priceHoldPct } = cockpit
  // Position au niveau comparaison (kpis, fiable) : concurrent moins cher = je perds.
  const lose = kpis.cheaperThanMe
  const align = kpis.aligned
  const win = kpis.dearerThanMe
  const total = lose + align + win || 1
  const seg = (n: number) => `${(n / total) * 100}%`

  return (
    <section className="radar-card radar-in overflow-hidden px-5 pt-5 pb-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[13px]" style={{ color: 'var(--radar-text-2)' }}>Tenue prix</p>
          <p className="radar-rounded radar-tnum mt-0.5 text-[46px] font-bold leading-none">{fmtPct(priceHoldPct)}</p>
          <p className="mt-1 text-[12px]" style={{ color: 'var(--radar-text-3)' }}>
            aligné ou moins cher · {fmtInt(kpis.comparisons)} comparaisons
          </p>
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: 'var(--radar-accent-soft)' }}>
          <Radar size={20} color="var(--radar-accent-2)" />
        </div>
      </div>

      <div className="mt-3 h-9">
        <RadarSparkline values={holdSeries.length > 1 ? holdSeries : [priceHoldPct ?? 0, priceHoldPct ?? 0]} height={36} area leadingDot ariaLabel="Tendance tenue prix" />
      </div>

      {/* Barre de position (comparaisons chiffrées) */}
      <div className="mt-3 flex h-2 overflow-hidden rounded-full" style={{ background: 'var(--radar-surface-2)' }}>
        <div style={{ width: seg(win), background: 'var(--radar-good)' }} />
        <div style={{ width: seg(align), background: 'var(--radar-warn)' }} />
        <div style={{ width: seg(lose), background: 'var(--radar-bad)' }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px]" style={{ color: 'var(--radar-text-2)' }}>
        <span><b style={{ color: 'var(--radar-good)' }}>{fmtInt(win)}</b> je gagne</span>
        <span><b style={{ color: 'var(--radar-warn)' }}>{fmtInt(align)}</b> alignés</span>
        <span><b style={{ color: 'var(--radar-bad)' }}>{fmtInt(lose)}</b> je perds</span>
      </div>

      {/* Collecte live */}
      {ops && (
        <div className="mt-4 flex items-center gap-2 border-t pt-3 text-[12px]" style={{ borderColor: 'var(--radar-hair)', color: 'var(--radar-text-2)' }}>
          <span className={`h-1.5 w-1.5 rounded-full ${collectActive ? 'radar-live-dot' : ''}`} style={{ background: collectActive ? 'var(--radar-live)' : 'var(--radar-text-3)' }} />
          <span style={{ color: 'var(--radar-text)' }}>{fmtInt(ops.totalIndexed)}</span> fiches collectées
          <span style={{ color: 'var(--radar-text-3)' }}>·</span>
          {ops.sitesActive}/{ops.sitesTotal} sites
          {ops.lastCollectAt && (<><span style={{ color: 'var(--radar-text-3)' }}>·</span>{timeAgo(ops.lastCollectAt)}</>)}
        </div>
      )}
    </section>
  )
}
