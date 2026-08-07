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
      {/* Clé de lecture en UNE ligne, l'explication longue au survol : quatre lignes de
          texte coûtaient plus de hauteur que trois rangées du tableau lui-même.
          ⚠ Les pastilles reprennent EXACTEMENT `heatColor`, aux valeurs extrêmes de
          l'échelle — une légende peinte à la main finirait par mentir sur les cases. */}
      <div className="flex items-center gap-2.5 mb-3 text-[11px] text-white/45 flex-wrap"
        title={t('pw.heat.lead')}>
        <span className="text-white/60">{t('pw.heat.lead.short')}</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-5 h-4 rounded-sm border border-white/10 flex items-center justify-center text-[9px] text-white/70"
            style={{ backgroundColor: heatColor(-25) }}>−</span>
          {t('pw.heat.legend.cheaper')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-5 h-4 rounded-sm border border-white/10" style={{ backgroundColor: heatColor(0) }} />
          {t('pw.heat.legend.aligned')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-5 h-4 rounded-sm border border-white/10 flex items-center justify-center text-[9px] text-white/70"
            style={{ backgroundColor: heatColor(25) }}>+</span>
          {t('pw.heat.legend.dearer')}
        </span>
        <span className="text-white/20">·</span>
        <span className="text-white/35">{t('pw.heat.legend.click')}</span>
      </div>
      <div className="overflow-x-auto">
        {/* `w-full` : les colonnes se répartissent la largeur disponible au lieu de se
            tasser à gauche en laissant les deux tiers de la carte vides. */}
        <table className="w-full border-separate border-spacing-0.5 text-xs tabular-nums">
          <thead>
            <tr>
              <th className="sticky left-0 bg-surface" />
              {/* Familles à l'HORIZONTALE : elles avaient été redressées à la verticale parce
                  que les colonnes ne faisaient que 74 px et confondaient tous les noms dans
                  le même « … ». La matrice occupe désormais toute la largeur — le nom tient
                  couché, sur deux lignes au besoin, et se lit sans tourner la tête. */}
              {cols.map((f) => (
                <th key={f} className="px-1 pb-1.5 align-bottom">
                  <div
                    className="text-white/55 text-[10px] font-medium leading-tight text-center line-clamp-2 break-words"
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
                {/* Domaines À GAUCHE : alignés à droite, ils laissaient devant eux une bande
                    vide de la largeur du plus long, et l'œil devait remonter chaque nom
                    depuis la grille. La colonne commence là où commence la carte. */}
                <td onClick={() => onSelect?.({ competitor: r.siteId })}
                  className="sticky left-0 bg-surface pr-3 text-white/70 text-left whitespace-nowrap max-w-[190px] truncate cursor-pointer hover:text-white" title={r.domain}>
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
                      className={`h-9 min-w-[52px] text-center rounded-sm border border-white/5 text-white/85 ${cell?.n ? 'cursor-pointer' : ''}`}
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
