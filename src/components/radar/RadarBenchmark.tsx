import { Swords } from 'lucide-react'
import type { Cockpit } from '@/features/priceWatch/dashboard/analytics'
import { fmtGapPct, fmtInt, fmtPct } from '@/features/priceWatch/radar/radarFormat'

function Cell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="radar-tnum text-[13px] font-semibold" style={{ color: tone ?? 'var(--radar-text)' }}>{value}</p>
      <p className="text-[10px]" style={{ color: 'var(--radar-text-3)' }}>{label}</p>
    </div>
  )
}

/** Benchmark concurrents COMPLET : un concurrent par carte, tri du plus agressif au moins. */
export function RadarBenchmark({ cockpit }: { cockpit: Cockpit }) {
  const items = cockpit.competitors.filter((c) => c.matched > 0)
  if (items.length === 0) return null
  return (
    <section className="radar-card radar-in px-4 py-4">
      <div className="mb-3 flex items-center gap-2">
        <Swords size={16} color="var(--radar-accent-2)" />
        <h2 className="text-[15px] font-semibold">Benchmark concurrents</h2>
        <span className="ml-auto text-[12px]" style={{ color: 'var(--radar-text-3)' }}>{items.length} sites</span>
      </div>
      <ul className="space-y-3">
        {items.map((c) => {
          // Médiane (repli moyenne pour les rapports antérieurs) : la moyenne d'un ratio
          // non borné en haut dérive sur quelques appariements aberrants.
          const gap = c.medianGapPct ?? c.avgGapPct
          const aggressive = gap != null && gap < 0
          return (
            <li key={c.siteId} className="radar-inset px-3 py-2.5">
              <div className="flex items-center justify-between">
                <span className="truncate pr-2 text-[13px] font-medium">{c.domain}</span>
                <span className="radar-tnum shrink-0 text-[15px] font-bold" style={{ color: aggressive ? 'var(--radar-bad)' : 'var(--radar-good)' }}>
                  {fmtGapPct(gap)}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-2">
                <Cell label="appariés" value={fmtInt(c.matched)} />
                <Cell label="me bat" value={fmtPct(c.cheaperRate * 100)} tone={c.cheaper > 0 ? 'var(--radar-bad)' : undefined} />
                <Cell label="médian" value={fmtGapPct(c.medianGapPct)} />
                <Cell label="ruptures" value={fmtInt(c.ruptures)} />
              </div>
              <div className="mt-1.5 text-[10.5px]" style={{ color: 'var(--radar-text-3)' }}>
                fourchette {fmtGapPct(c.minGapPct)} … {fmtGapPct(c.maxGapPct)}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
