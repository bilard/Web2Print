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
      <div className="flex items-baseline justify-between mb-1 gap-3 flex-wrap">
        <div className="text-sm font-semibold text-white">{t('pw.tail.gapByCompetitorFamily')}</div>
        <div className="text-[11px] text-white/35">{t('pw.chart.avgGap')}{ck.truncated ? t('pw.chart.onTop1000') : ''}</div>
      </div>
      {/* À quoi sert ce tableau : rien ne le disait, et une grille de nombres colorés sans
          clé de lecture n'apprend rien à qui ne l'a pas conçue. */}
      <p className="text-[11px] text-white/45 mb-2 max-w-[70ch]">{t('pw.heat.lead')}</p>
      <div className="flex items-center gap-3 mb-3 text-[10px] text-white/40 flex-wrap">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: heatColor(-25) }} />
          {t('pw.heat.legend.cheaper')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm border border-white/10" style={{ backgroundColor: heatColor(0) }} />
          {t('pw.heat.legend.aligned')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: heatColor(25) }} />
          {t('pw.heat.legend.dearer')}
        </span>
        <span className="text-white/25">·</span>
        <span>{t('pw.heat.legend.click')}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0.5 text-xs tabular-nums">
          <thead>
            <tr>
              <th className="sticky left-0 bg-surface" />
              {/* Familles écrites À LA VERTICALE : tronquées à 74 px, « ORIGINAL PARTS » et
                  « F1 MTD NON STOCKÉ » se réduisaient au même « … » et ne se distinguaient
                  plus. Verticales, elles tiennent en entier sans élargir les colonnes. */}
              {cols.map((f) => (
                <th key={f} className="px-0.5 pb-1 align-bottom">
                  <div
                    className="h-[104px] mx-auto text-white/55 text-[10px] font-medium whitespace-nowrap overflow-hidden text-ellipsis [writing-mode:vertical-rl] rotate-180"
                    title={f}
                  >
                    {f}
                  </div>
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
