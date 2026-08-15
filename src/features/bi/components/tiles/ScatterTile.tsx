// Nuage de points : deux mesures confrontées, un point par ligne du résultat.
//
// ⚠ C'est le seul visuel 2D qui demande DEUX mesures pour vouloir dire quelque chose (prix
// contre écart, volume contre couverture). Avec une seule, on le DIT plutôt que de tracer
// une ligne de points alignés qui n'apprendrait rien.
//
// ⚠⚠ Une dimension de LÉGENDE y colorie les points par catégorie — elle n'ajoute aucun jeu
// de données, les deux axes restant les deux mesures. C'est ce qui permet de lire « qui est
// moins cher » sur un nuage prix × écart, d'un coup d'œil et sans survoler.
import { Scatter } from 'react-chartjs-2'
import { Chart, LinearScale, PointElement, Tooltip, Legend } from 'chart.js'
import { useThemeStore } from '@/stores/theme.store'
import { installChartVisibilityRepair } from '@/lib/chartVisibility'
import { formatMeasure } from '../../engine/formatValue'
import { buildScatter, type ScatterPoint } from './scatterData'
import { biLabel } from '../biLabel'
import { intlLocale, useTranslation } from '@/lib/i18n'
import type { AggregateResult } from '../../engine/aggregate'

Chart.register(LinearScale, PointElement, Tooltip, Legend)
// ⚠⚠ Un graphe monté pendant que l'onglet est masqué garde des zones cliquables de hauteur
// NULLE : plus aucun clic ne filtre. La réparation se pose une fois, au retour de l'onglet.
installChartVisibilityRepair()

export function ScatterTile({ result }: { result: AggregateResult }) {
  const { t, locale } = useTranslation()
  const dark = useThemeStore((s) => s.resolvedTheme) === 'dark'
  const tick = dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.55)'
  const grid = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'

  const model = buildScatter(result, t('bi.scatter.otherSeries'))
  if (!model) {
    return (
      <p className="grid h-full place-items-center px-4 text-center text-[11px] text-white/35">
        {t('bi.scatter.needsTwoMeasures')}
      </p>
    )
  }
  const { x: mx, y: my } = model.axes
  const nx = biLabel(mx, t)
  const ny = biLabel(my, t)
  const fmt = (value: number, axis: 'x' | 'y') =>
    formatMeasure(value, (axis === 'x' ? mx : my).format, intlLocale(locale))
  // ⚠ La légende ne s'affiche QUE si elle nomme quelque chose : sur un nuage sans catégorie,
  // une pastille intitulée « » prendrait de la place pour ne rien dire.
  const named = model.series.length > 1 || model.series[0].label !== ''

  return (
    <div className="flex h-full flex-col gap-1">
      <div className="min-h-0 flex-1">
        <Scatter
          data={{
            datasets: model.series.map((s) => ({
              label: s.label || ny, data: s.points, backgroundColor: s.color,
            })),
          }}
          options={{
            maintainAspectRatio: false,
            plugins: {
              legend: { display: named, labels: { color: tick, boxWidth: 10, usePointStyle: true } },
              tooltip: {
                callbacks: {
                  label: (c: { raw: unknown }) => {
                    const p = c.raw as ScatterPoint
                    return `${p.label} — ${nx} : ${fmt(p.x, 'x')} · ${ny} : ${fmt(p.y, 'y')}`
                  },
                },
              },
            },
            scales: {
              x: { title: { display: true, text: nx, color: tick },
                ticks: { color: tick }, grid: { color: grid } },
              y: { title: { display: true, text: ny, color: tick },
                ticks: { color: tick }, grid: { color: grid } },
            },
          }}
        />
      </div>
      {/* ⚠ Les lignes écartées sont DITES : un nuage amputé sans un mot se lit comme une
          donnée complète, et c'est sur lui qu'on décide. */}
      {model.dropped > 0 && (
        <p className="shrink-0 text-right text-[10px] text-amber-400/70">
          {t('bi.scatter3d.dropped', { count: model.dropped })}
        </p>
      )}
    </div>
  )
}
