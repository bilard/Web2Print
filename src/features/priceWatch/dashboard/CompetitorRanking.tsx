// src/features/priceWatch/dashboard/CompetitorRanking.tsx
// Benchmark concurrentiel dense : un concurrent par ligne, trié par agressivité
// (écart moyen le plus négatif = casse les prix le plus). avgGapPct est FIABLE (agrégé
// serveur) ; médiane/plage sont recalculées (biais possible si truncated → mention).
import type { Cockpit, CockpitFilter, CompetitorAnalytics } from './analytics'
import { pct } from './format'

const gapClass = (v: number | null) =>
  v == null ? 'text-white/40' : v < -1 ? 'text-rose-400' : v > 1 ? 'text-emerald-400' : 'text-amber-400'

export function CompetitorRanking({ ck, onSelect, active, onOpenAudit }: {
  ck: Cockpit; onSelect?: (patch: Partial<CockpitFilter>) => void; active?: string; onOpenAudit?: () => void
}) {
  const rows = ck.competitors

  return (
    <div className="bg-surface rounded-lg p-4 h-full">
      <div className="flex items-baseline justify-between mb-3 gap-2">
        <div className="text-sm font-semibold text-white">Benchmark concurrents</div>
        {onOpenAudit && (
          <button type="button" onClick={onOpenAudit}
            className="text-[11px] text-indigo-300 hover:text-indigo-200 border border-indigo-400/30 rounded px-2 py-0.5">
            Audit collecte
          </button>
        )}
        <div className="text-[11px] text-white/35 ml-auto">tri par agressivité</div>
      </div>
      {rows.length === 0 ? (
        <div className="text-white/40 text-sm py-8 text-center">Aucun concurrent chiffré.</div>
      ) : (
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="text-white/40 text-[10px] uppercase tracking-wide text-right">
              <th className="text-left font-medium pb-2">Concurrent</th>
              <th className="font-medium pb-2">App.</th>
              <th className="font-medium pb-2">Me bat</th>
              <th className="font-medium pb-2">Moyen</th>
              <th className="font-medium pb-2">Médian</th>
              <th className="font-medium pb-2">Rupt.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: CompetitorAnalytics) => {
              const beat = Math.round(r.cheaperRate * 100)
              return (
                <tr key={r.siteId} onClick={() => onSelect?.({ competitor: r.siteId })}
                  className={`border-t border-white/5 text-right cursor-pointer hover:bg-white/[0.04] ${active === r.siteId ? 'bg-indigo-500/10' : ''}`}>
                  <td className="text-left py-1.5 text-white/85 truncate max-w-[150px]" title={r.domain}>
                    {r.domain.replace(/^www\./, '')}
                  </td>
                  <td className="text-white/55">{r.matched}</td>
                  <td className={beat >= 50 ? 'text-rose-400' : 'text-white/60'}>{beat}%</td>
                  <td className={`font-medium whitespace-nowrap ${gapClass(r.avgGapPct)}`}>{pct(r.avgGapPct)}</td>
                  <td className={`whitespace-nowrap ${gapClass(r.medianGapPct)}`}>{pct(r.medianGapPct)}</td>
                  <td className={r.ruptures > 0 ? 'text-amber-400' : 'text-white/35'}>{r.ruptures}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
