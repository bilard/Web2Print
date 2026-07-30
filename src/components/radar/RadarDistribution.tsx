import { BarChart3 } from 'lucide-react'
import type { Cockpit } from '@/features/priceWatch/dashboard/analytics'
import { fmtGapPct, fmtInt } from '@/features/priceWatch/radar/radarFormat'
import { t } from '@/lib/i18n'

const toneColor = (tone: 'cheaper' | 'aligned' | 'dearer'): string =>
  tone === 'cheaper' ? 'var(--radar-bad)' : tone === 'dearer' ? 'var(--radar-good)' : 'var(--radar-warn)'

/** Histogramme de la distribution des écarts de prix (concurrent vs moi), par tranches. */
export function RadarDistribution({ cockpit }: { cockpit: Cockpit }) {
  const { histogram, medianGapPct, meanGapPct, truncated } = cockpit
  const maxBin = Math.max(1, ...histogram.map((b) => b.count))
  return (
    <section className="radar-card radar-in px-4 py-4">
      <div className="mb-3 flex items-center gap-2">
        <BarChart3 size={16} color="var(--radar-accent-2)" />
        <h2 className="text-[15px] font-semibold">{t('rd.gapDistribution')}</h2>
        <span className="ml-auto radar-tnum text-[12px]" style={{ color: 'var(--radar-text-3)' }}>
          méd {fmtGapPct(medianGapPct)} · moy {fmtGapPct(meanGapPct)}
        </span>
      </div>
      <ul className="space-y-1.5">
        {histogram.map((b) => (
          <li key={b.label} className="flex items-center gap-2 text-[11px]">
            <span className="radar-tnum w-16 shrink-0 text-right" style={{ color: 'var(--radar-text-2)' }}>{b.label}</span>
            <div className="h-3.5 flex-1 overflow-hidden rounded-[4px]" style={{ background: 'var(--radar-surface-2)' }}>
              <div className="h-full rounded-[4px]" style={{ width: `${(b.count / maxBin) * 100}%`, background: toneColor(b.tone), opacity: b.count ? 1 : 0 }} />
            </div>
            <span className="radar-tnum w-9 shrink-0 text-right" style={{ color: 'var(--radar-text-3)' }}>{fmtInt(b.count)}</span>
          </li>
        ))}
      </ul>
      {truncated && (
        <p className="mt-2 text-[10.5px]" style={{ color: 'var(--radar-text-3)' }}>
          {t('radarDistribution.cappedSampleThe')}
        </p>
      )}
    </section>
  )
}
