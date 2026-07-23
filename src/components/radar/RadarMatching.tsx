import { Link2 } from 'lucide-react'
import type { Cockpit } from '@/features/priceWatch/dashboard/analytics'
import { fmtInt } from '@/features/priceWatch/radar/radarFormat'

function Chip({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="radar-inset px-3 py-2.5 text-center">
      <p className="radar-tnum text-[19px] font-bold leading-none" style={{ color: tone ?? 'var(--radar-text)' }}>{value}</p>
      <p className="mt-1 text-[10.5px]" style={{ color: 'var(--radar-text-3)' }}>{label}</p>
    </div>
  )
}

/** Qualité d'appariement : combien de produits, par quelle preuve, et volume de comparaisons. */
export function RadarMatching({ cockpit }: { cockpit: Cockpit }) {
  const { kpis } = cockpit
  return (
    <section className="radar-card radar-in px-4 py-4">
      <div className="mb-3 flex items-center gap-2">
        <Link2 size={16} color="var(--radar-accent-2)" />
        <h2 className="text-[15px] font-semibold">Appariement</h2>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Chip label="appariés" value={fmtInt(kpis.products)} />
        <Chip label="EAN/réf exact" value={fmtInt(kpis.matchedExact)} tone="var(--radar-good)" />
        <Chip label="pièce d'origine" value={fmtInt(kpis.matchedOriginOnly)} tone="var(--radar-warn)" />
        <Chip label="comparaisons" value={fmtInt(kpis.comparisons)} />
        <Chip label="je perds" value={fmtInt(kpis.cheaperThanMe)} tone="var(--radar-bad)" />
        <Chip label="ruptures" value={fmtInt(kpis.ruptures)} />
      </div>
    </section>
  )
}
