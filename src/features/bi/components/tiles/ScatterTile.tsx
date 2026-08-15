// Nuage de points : deux mesures confrontées, un point par valeur de la dimension.
//
// ⚠ C'est le seul visuel qui demande DEUX mesures pour vouloir dire quelque chose (prix
// contre écart, volume contre couverture). Avec une seule, on le DIT plutôt que de tracer
// une ligne de points alignés qui n'apprendrait rien.
import { Scatter } from 'react-chartjs-2'
import { Chart, LinearScale, PointElement, Tooltip, Legend } from 'chart.js'
import { useThemeStore } from '@/stores/theme.store'
import { installChartVisibilityRepair } from '@/lib/chartVisibility'
import { formatMeasure } from '../../engine/formatValue'
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

  const dim = result.columns.find((c) => c.role === 'dimension')
  const measures = result.columns.filter((c) => c.role === 'measure')
  if (measures.length < 2) {
    return <p className="text-[11px] text-white/35">{t('bi.scatter.needsTwoMeasures')}</p>
  }
  const [mx, my] = measures

  const points = result.rows.map((r) => ({
    x: typeof r[mx.key] === 'number' ? (r[mx.key] as number) : null,
    y: typeof r[my.key] === 'number' ? (r[my.key] as number) : null,
    label: dim ? String(r[dim.key] ?? t('bi.filters.emptyValue')) : '',
  // ⚠ Un point sans l'une de ses deux coordonnées n'est pas un point à l'origine : il est
  // ÉCARTÉ. Le placer en (0,0) inventerait une observation.
  })).filter((p): p is { x: number; y: number; label: string } => p.x !== null && p.y !== null)

  return (
    <Scatter
      data={{ datasets: [{ label: biLabel(my, t), data: points, backgroundColor: '#6366f1' }] }}
      options={{
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (c: { raw: unknown }) => {
                const p = c.raw as { x: number; y: number; label: string }
                return `${p.label} — ${biLabel(mx, t)} : ${formatMeasure(p.x, mx.format, intlLocale(locale))}`
                  + ` · ${biLabel(my, t)} : ${formatMeasure(p.y, my.format, intlLocale(locale))}`
              },
            },
          },
        },
        scales: {
          x: { title: { display: true, text: biLabel(mx, t), color: tick },
               ticks: { color: tick }, grid: { color: grid } },
          y: { title: { display: true, text: biLabel(my, t), color: tick },
               ticks: { color: tick }, grid: { color: grid } },
        },
      }}
    />
  )
}
