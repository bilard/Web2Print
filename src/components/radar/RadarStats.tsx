import { BarChart3, Layers, Link2 } from 'lucide-react'
import type { Cockpit } from '@/features/priceWatch/dashboard/analytics'
import { fmtGapPct, fmtInt } from '@/features/priceWatch/radar/radarFormat'

const toneColor = (tone: 'cheaper' | 'aligned' | 'dearer'): string =>
  tone === 'cheaper' ? 'var(--radar-bad)' : tone === 'dearer' ? 'var(--radar-good)' : 'var(--radar-warn)'

function Chip({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="radar-inset px-3 py-2.5 text-center">
      <p className="radar-tnum text-[19px] font-bold leading-none" style={{ color: tone ?? 'var(--radar-text)' }}>{value}</p>
      <p className="mt-1 text-[10.5px]" style={{ color: 'var(--radar-text-3)' }}>{label}</p>
    </div>
  )
}

/** Onglet Statistiques : distribution des écarts, appariement, familles (buildCockpit). */
export function RadarStats({ cockpit }: { cockpit: Cockpit }) {
  const { kpis, histogram, families, medianGapPct, meanGapPct, truncated } = cockpit
  const maxBin = Math.max(1, ...histogram.map((b) => b.count))
  const maxFam = Math.max(1, ...families.map((f) => f.products))

  return (
    <div className="space-y-4">
      {/* Distribution des écarts */}
      <section className="radar-card radar-in px-4 py-4">
        <div className="mb-3 flex items-center gap-2">
          <BarChart3 size={16} color="var(--radar-accent-2)" />
          <h2 className="text-[15px] font-semibold">Distribution des écarts</h2>
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
            Échantillon plafonné (1000 produits les plus exposés) — les headline restent exacts.
          </p>
        )}
      </section>

      {/* Appariement */}
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

      {/* Top familles */}
      {families.length > 0 && (
        <section className="radar-card radar-in px-4 py-4">
          <div className="mb-2 flex items-center gap-2">
            <Layers size={16} color="var(--radar-accent-2)" />
            <h2 className="text-[15px] font-semibold">Familles</h2>
            <span className="ml-auto text-[12px]" style={{ color: 'var(--radar-text-3)' }}>sous-cotés · écart moy</span>
          </div>
          <ul className="space-y-3">
            {families.slice(0, 8).map((f) => (
              <li key={f.famille}>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="truncate pr-2 font-medium">{f.famille}</span>
                  <span className="radar-tnum shrink-0" style={{ color: 'var(--radar-text-2)' }}>
                    <span style={{ color: f.undercut ? 'var(--radar-bad)' : 'var(--radar-text-3)' }}>{fmtInt(f.undercut)}</span>/{fmtInt(f.products)}
                    <span style={{ color: 'var(--radar-text-3)' }}> · {fmtGapPct(f.avgGapPct)}</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--radar-surface-2)' }}>
                  <div className="h-full rounded-full" style={{ width: `${(f.products / maxFam) * 100}%`, background: 'var(--radar-accent)' }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
