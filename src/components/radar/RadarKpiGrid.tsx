import type { Cockpit } from '@/features/priceWatch/dashboard/analytics'
import { fmtEurCompact, fmtGapPct, fmtInt, fmtPct } from '@/features/priceWatch/radar/radarFormat'

function Tile({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="radar-card px-4 py-3.5">
      <p className="text-[12px]" style={{ color: 'var(--radar-text-2)' }}>{label}</p>
      <p className="radar-rounded radar-tnum mt-1 text-[26px] font-bold leading-none" style={{ color: tone ?? 'var(--radar-text)' }}>{value}</p>
      <p className="mt-1 text-[11px]" style={{ color: 'var(--radar-text-3)' }}>{sub}</p>
    </div>
  )
}

/** Grille 2×2 des indicateurs clés (tous FIABLES, issus de report.kpis / byCompetitor). */
export function RadarKpiGrid({ cockpit }: { cockpit: Cockpit }) {
  const { kpis, exposedPct, medianGapPct, totalGapEur, competitorsCount } = cockpit
  return (
    <section className="radar-in grid grid-cols-2 gap-3 landscape:grid-cols-4">
      <Tile
        label="Exposés"
        value={fmtPct(exposedPct)}
        sub={`${fmtInt(kpis.productsUndercut)}/${fmtInt(kpis.products)} prix sous-cotés`}
        tone={exposedPct != null && exposedPct > 0 ? 'var(--radar-bad)' : undefined}
      />
      <Tile
        label="Impact €"
        value={fmtEurCompact(totalGapEur)}
        sub="écart vs le moins cher"
        tone={totalGapEur > 0 ? 'var(--radar-warn)' : undefined}
      />
      <Tile
        label="Écart médian"
        value={fmtGapPct(medianGapPct)}
        sub="concurrents vs moi"
      />
      <Tile
        label="Concurrents"
        value={fmtInt(competitorsCount)}
        sub={`${fmtInt(kpis.products)} produits appariés`}
      />
    </section>
  )
}
