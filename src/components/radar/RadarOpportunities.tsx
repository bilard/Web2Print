import { TrendingDown } from 'lucide-react'
import type { Cockpit } from '@/features/priceWatch/dashboard/analytics'
import { fmtEur, fmtEurCompact, fmtGapPct } from '@/features/priceWatch/radar/radarFormat'
import { t } from '@/lib/i18n'

/** Top opportunités « où baisser » : produits où je suis le plus cher, triés par impact € unitaire. */
export function RadarOpportunities({ cockpit, landscape = false }: { cockpit: Cockpit; landscape?: boolean }) {
  const items = cockpit.opportunities.slice(0, landscape ? 10 : 6)
  if (items.length === 0) return null

  return (
    <section className="radar-card radar-in px-4 py-4">
      <div className="mb-2 flex items-center gap-2">
        <TrendingDown size={16} color="var(--radar-warn)" />
        <h2 className="text-[15px] font-semibold">{t('rd.whereToLower')}</h2>
        <span className="ml-auto text-[12px]" style={{ color: 'var(--radar-text-3)' }}>impact unitaire</span>
      </div>
      <ul className="divide-y" style={{ borderColor: 'var(--radar-hair)' }}>
        {items.map((o) => (
          <li key={o.id} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium">{o.name}</p>
              <p className="mt-0.5 truncate text-[11px]" style={{ color: 'var(--radar-text-3)' }}>
                {fmtEur(o.myPriceHt)} → <span style={{ color: 'var(--radar-text-2)' }}>{fmtEur(o.minPriceHt)}</span>
                {o.minDomain ? ` · ${o.minDomain}` : ''}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="radar-tnum text-[15px] font-semibold" style={{ color: 'var(--radar-warn)' }}>−{fmtEurCompact(o.gapEur)}</p>
              <p className="radar-tnum text-[11px]" style={{ color: 'var(--radar-text-3)' }}>{fmtGapPct(o.gapPct)}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
