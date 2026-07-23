import { Swords } from 'lucide-react'
import type { Cockpit } from '@/features/priceWatch/dashboard/analytics'
import { fmtGapPct, fmtInt, fmtPct } from '@/features/priceWatch/radar/radarFormat'

const MAX = 5

/** Benchmark concurrents : triés du plus agressif (écart moyen le plus négatif) au moins. */
export function RadarCompetitors({ cockpit }: { cockpit: Cockpit }) {
  const items = cockpit.competitors.filter((c) => c.matched > 0).slice(0, MAX)
  if (items.length === 0) return null

  return (
    <section className="radar-card radar-in px-4 py-4">
      <div className="mb-2 flex items-center gap-2">
        <Swords size={16} color="var(--radar-accent-2)" />
        <h2 className="text-[15px] font-semibold">Concurrents</h2>
        <span className="ml-auto text-[12px]" style={{ color: 'var(--radar-text-3)' }}>écart moyen</span>
      </div>
      <ul className="divide-y" style={{ borderColor: 'var(--radar-hair)' }}>
        {items.map((c) => {
          const aggressive = c.avgGapPct != null && c.avgGapPct < 0
          return (
            <li key={c.siteId} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium">{c.domain}</p>
                <p className="mt-0.5 text-[11px]" style={{ color: 'var(--radar-text-3)' }}>
                  {fmtPct(c.cheaperRate * 100)} me bat · {fmtInt(c.matched)} appariés
                </p>
              </div>
              <p className="radar-tnum shrink-0 text-[15px] font-semibold" style={{ color: aggressive ? 'var(--radar-bad)' : 'var(--radar-good)' }}>
                {fmtGapPct(c.avgGapPct)}
              </p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
