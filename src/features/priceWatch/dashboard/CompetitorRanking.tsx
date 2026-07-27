// Benchmark concurrentiel dense : un concurrent par ligne, trié par agressivité
// (écart MÉDIAN le plus négatif = casse les prix le plus). Moyenne et médiane sont
// agrégées serveur hors filtre (fiables même si `truncated`) ; sous filtre elles sont
// recalculées sur l'échantillon, donc biaisées quand le rapport est tronqué.
import { Link2, TrendingDown, Sigma, AlignCenterHorizontal, PackageX } from 'lucide-react'
import type { Cockpit, CockpitFilter, CompetitorAnalytics } from './analytics'
import { pct } from './format'

const gapClass = (v: number | null) =>
  v == null ? 'text-white/40' : v < -1 ? 'text-rose-400' : v > 1 ? 'text-emerald-400' : 'text-amber-400'

// En-têtes chiffrés : picto coloré + infobulle (tooltip CSS fiable, pas le title natif).
const HEAD_COLS = [
  { Icon: Link2, color: 'text-indigo-400', tip: 'Appariés : tes produits retrouvés chez ce concurrent' },
  { Icon: TrendingDown, color: 'text-rose-400', tip: '« Me bat » : % de produits où ce concurrent est MOINS CHER que toi' },
  { Icon: Sigma, color: 'text-sky-400', tip: 'Écart de prix MOYEN — indicatif seulement : quelques appariements aberrants (lot vs unité) le tirent vers le haut' },
  { Icon: AlignCenterHorizontal, color: 'text-violet-400', tip: 'Écart de prix MÉDIAN — la position réelle du concurrent (ignore les valeurs extrêmes). C’est cette colonne qui trie le tableau.' },
  { Icon: PackageX, color: 'text-amber-400', tip: 'Ruptures de stock chez ce concurrent (opportunités pour toi)' },
]

export function CompetitorRanking({ ck, onSelect, active, onOpenAudit, progressBySite }: {
  ck: Cockpit; onSelect?: (patch: Partial<CockpitFilter>) => void; active?: string; onOpenAudit?: () => void
  /** Progression du balayage par siteId (0..1) — barre « thermomètre » sous chaque nom. */
  progressBySite?: Map<string, number>
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
        <div className="max-h-[460px] overflow-y-auto overscroll-contain -mx-1 px-1">
        <table className="w-full text-xs tabular-nums">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="text-[10px] uppercase tracking-wide text-right bg-well">
              <th className="text-left font-semibold py-2 pl-2 rounded-l-md text-white/60">Concurrent</th>
              {HEAD_COLS.map((c, i) => {
                const Icon = c.Icon
                return (
                  <th key={i} className={`relative group py-2 px-1 ${i === HEAD_COLS.length - 1 ? 'pr-2 rounded-r-md' : ''}`}>
                    <Icon className={`w-4 h-4 inline-block ${c.color}`} />
                    <span className="pointer-events-none absolute z-30 top-full mt-1 right-0 whitespace-nowrap rounded bg-background border border-white/15 px-2 py-1 text-[10px] normal-case tracking-normal text-white/85 opacity-0 group-hover:opacity-100 transition-opacity shadow-xl">
                      {c.tip}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r: CompetitorAnalytics) => {
              const beat = Math.round(r.cheaperRate * 100)
              return (
                <tr key={r.siteId} onClick={() => onSelect?.({ competitor: r.siteId })}
                  className={`border-t border-white/5 text-right cursor-pointer hover:bg-white/[0.04] ${active === r.siteId ? 'bg-indigo-500/10' : ''}`}>
                  <td className="text-left py-1.5" title={r.domain}>
                    <div className="truncate max-w-[150px] text-white/85">{r.domain.replace(/^www\./, '')}</div>
                    {(() => {
                      const prog = progressBySite?.get(r.siteId)
                      if (prog == null) return null
                      const pct = Math.min(100, Math.round(prog * 100))
                      return (
                        <div className="mt-1 h-1 rounded-full bg-well overflow-hidden max-w-[150px]" title={`Familles parcourues ${pct} %`}>
                          <div className={`h-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-indigo-400'}`} style={{ width: `${pct}%` }} />
                        </div>
                      )
                    })()}
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
        </div>
      )}
    </div>
  )
}
