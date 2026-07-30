import { Database } from 'lucide-react'
import type { OpsCockpit } from '@/features/priceWatch/dashboard/opsMetrics'
import { fmtInt, fmtPct } from '@/features/priceWatch/radar/radarFormat'
import { isCursorDomain } from '@/features/priceWatch/radar/scrapeState'
import { RadarCollectStats } from './RadarCollectStats'
import { t } from '@/lib/i18n'

/** Onglet Volumétrie : combien de fiches collectées, chez qui, à quel rythme (buildOpsCockpit). */
export function RadarVolume({ ops }: { ops: OpsCockpit | null }) {
  if (!ops || !ops.hasData) {
    return (
      <div className="radar-card px-5 py-8 text-center text-[13px]" style={{ color: 'var(--radar-text-2)' }}>
        {t('radarVolume.waitingForThe')}
      </div>
    )
  }
  // Les docs curseur de la recherche dirigée ne sont pas des concurrents : jamais listés.
  const competitors = ops.competitors.filter((c) => !isCursorDomain(c.domain))
  const maxIndexed = Math.max(1, ...competitors.map((c) => c.indexed))

  return (
    <div className="space-y-4">
      <RadarCollectStats ops={ops} />

      <section className="radar-card radar-in px-4 py-4">
        <div className="mb-2 flex items-center gap-2">
          <Database size={16} color="var(--radar-accent-2)" />
          <h2 className="text-[15px] font-semibold">Fiches par concurrent</h2>
          <span className="ml-auto text-[12px]" style={{ color: 'var(--radar-text-3)' }}>% avec prix</span>
        </div>
        <ul className="grid gap-y-3 landscape:grid-cols-2 landscape:gap-x-8">
          {competitors.map((c) => (
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
