// Heatmap concurrent × famille : écart moyen (concurrent vs moi) par croisement.
// Fond diverging (rose = concurrent moins cher, émeraude = je suis moins cher). Repère
// d'un coup d'œil OÙ un concurrent est agressif (colonne/famille rouge). Recalc → mention.
import type { Cockpit, CockpitFilter } from './analytics'
import { heatColor } from './format'
import { useTranslation } from '@/lib/i18n'

export function HeatmapMatrix({ ck, onSelect }: { ck: Cockpit; onSelect?: (patch: Partial<CockpitFilter>) => void }) {
  const { t } = useTranslation()
  const cols = ck.familyKeys
  // Seuls les concurrents avec au moins un apparié : évite 16 lignes vides.
  const rows = ck.competitors.filter((c) => c.matched > 0)

  if (cols.length === 0 || rows.length === 0) {
    return (
      <div className="bg-surface rounded-lg p-4">
        <div className="text-sm font-semibold text-white mb-3">{t('pw.tail.gapByCompetitorFamily')}</div>
        <div className="text-white/40 text-sm py-8 text-center">{t('pw.chart.notEnough')}</div>
      </div>
    )
  }

  return (
    <div className="bg-surface rounded-lg p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-sm font-semibold text-white">{t('pw.tail.gapByCompetitorFamily')}</div>
        <div className="text-[11px] text-white/35">{t('pw.chart.avgGap')}{ck.truncated ? t('pw.chart.onTop1000') : ''}</div>
      </div>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0.5 text-xs tabular-nums">
          <thead>
            <tr>
              <th className="sticky left-0 bg-surface" />
              {cols.map((f) => (
                <th key={f} className="px-1 pb-1 text-white/45 text-[10px] font-medium align-bottom">
                  <div className="max-w-[74px] truncate mx-auto text-center" title={f}>{f}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.siteId}>
                <td onClick={() => onSelect?.({ competitor: r.siteId })}
                  className="sticky left-0 bg-surface pr-2 text-white/70 text-right whitespace-nowrap max-w-[150px] truncate cursor-pointer hover:text-white" title={r.domain}>
                  {r.domain}
                </td>
                {cols.map((f) => {
                  const cell = ck.heatmap[r.siteId]?.[f]
                  const g = cell?.avgGapPct ?? null
                  return (
                    <td
                      key={f}
                      onClick={() => cell?.n && onSelect?.({ famille: f, competitor: r.siteId })}
                      title={cell && cell.n ? t('pw.heat.cellTitle', {
                domain: r.domain, field: f, sign: g! > 0 ? '+' : '',
                pct: Math.round(g! * 10) / 10, count: cell.n,
              }) : t('pw.heat.noMatch')}
                      className={`h-8 min-w-[52px] text-center rounded-sm border border-white/5 text-white/85 ${cell?.n ? 'cursor-pointer' : ''}`}
                      style={{ backgroundColor: g == null ? 'transparent' : heatColor(g) }}
                    >
                      {g == null ? <span className="text-white/20">·</span> : `${g > 0 ? '+' : ''}${Math.round(g)}`}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
