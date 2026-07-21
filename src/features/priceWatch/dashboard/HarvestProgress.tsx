// src/features/priceWatch/dashboard/HarvestProgress.tsx
// Thermomètre de progression du balayage des catalogues concurrents. Une barre par
// concurrent (part des catégories parcourues, 0→100 %) + une moyenne globale. La donnée
// vient de CompetitorStat.harvest.progress (mesurée par la moisson, relue par le rapport).
import type { CompetitorStat } from '../catalog/report'

export function HarvestProgress({ stats }: { stats: CompetitorStat[] }) {
  const rows = stats
    .filter((s) => s.harvest != null)
    .sort((a, b) => (a.harvest!.progress) - (b.harvest!.progress)) // les moins avancés en tête
  if (rows.length === 0) return null
  const global = Math.round((rows.reduce((n, c) => n + c.harvest!.progress, 0) / rows.length) * 100)

  const bar = (pct: number) =>
    pct >= 100 ? 'bg-emerald-500' : pct >= 60 ? 'bg-indigo-400' : pct >= 25 ? 'bg-indigo-500' : 'bg-amber-500'

  return (
    <div className="bg-surface rounded-lg p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-sm font-semibold text-white">Progression du balayage</div>
        <div className="text-[11px] text-white/40 tabular-nums">{global}% moyen</div>
      </div>
      <div className="space-y-2">
        {rows.map((s) => {
          const pct = Math.min(100, Math.round(s.harvest!.progress * 100))
          return (
            <div key={s.siteId} className="flex items-center gap-2 text-[11px]">
              <span className="text-white/70 truncate w-36 shrink-0" title={s.domain}>{s.domain.replace(/^www\./, '')}</span>
              <div className="flex-1 h-2 rounded-full bg-well overflow-hidden">
                <div className={`h-full rounded-full ${bar(pct)} transition-all`} style={{ width: `${pct}%` }} />
              </div>
              <span className="text-white/50 tabular-nums w-9 text-right">{pct === 100 ? '✓' : `${pct}%`}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
