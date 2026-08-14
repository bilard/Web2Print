// Barres, courbes, aires, camemberts — sur `chart.js`, déjà au projet et déjà utilisé par
// le node « Graphique ». ⚠ Les couleurs de texte et de grille suivent le THÈME : lues
// depuis le store, jamais écrites en dur.
import { Bar, Line, Pie, Doughnut } from 'react-chartjs-2'
import {
  Chart, CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement,
  Tooltip, Legend, Filler,
} from 'chart.js'
import type { ChartType, TooltipItem } from 'chart.js'
import { useThemeStore } from '@/stores/theme.store'
import { intlLocale, useTranslation } from '@/lib/i18n'
import { formatMeasure } from '../../engine/formatValue'
import type { AggregateResult } from '../../engine/aggregate'
import type { TileKind } from '../../types'

Chart.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement,
  Tooltip, Legend, Filler)

const PALETTE = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4',
  '#a855f7', '#ec4899', '#84cc16', '#f97316', '#14b8a6']

export function ChartTile({ result, kind, stacked }: {
  result: AggregateResult; kind: TileKind; stacked?: boolean
}) {
  const { t, locale } = useTranslation()
  const dark = useThemeStore((s) => s.resolvedTheme) === 'dark'
  const tick = dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.55)'
  const grid = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'

  const dimKey = result.columns.find((c) => c.role === 'dimension')?.key
  const measures = result.columns.filter((c) => c.role === 'measure')
  // ⚠ `label` (venu de la donnée) prime sur `labelKey` (catalogue i18n) quand il est présent.
  const measureLabel = (m: (typeof measures)[number]) => m.label ?? t(m.labelKey)
  const labels = result.rows.map((r) => (dimKey ? String(r[dimKey] ?? '—') : ''))
  const data = {
    labels,
    datasets: measures.map((m, i) => ({
      label: measureLabel(m),
      data: result.rows.map((r) => Number(r[m.key] ?? 0)),
      backgroundColor: kind === 'pie' || kind === 'doughnut'
        ? labels.map((_, k) => PALETTE[k % PALETTE.length])
        : PALETTE[i % PALETTE.length],
      borderColor: PALETTE[i % PALETTE.length],
      fill: kind === 'area',
      tension: 0.25,
    })),
  }
  const options = {
    maintainAspectRatio: false,
    plugins: {
      // ⚠ Camembert/anneau nomment leurs tranches par la LÉGENDE (les labels de `data`,
      // pas le libellé de la série) : à une seule mesure, elle reste nécessaire.
      legend: {
        display: measures.length > 1 || kind === 'pie' || kind === 'doughnut',
        labels: { color: tick, boxWidth: 10 },
      },
      tooltip: {
        callbacks: {
          // ⚠ Le même callback sert aux 4 types de graphe : `parsed` est un nombre brut sur
          // camembert/anneau, un point {x,y} sur barres/courbes — d'où la garde de forme.
          // ⚠⚠ Le format vient de la SÉRIE survolée (`datasetIndex`), jamais de la première
          // mesure : sur un graphe à mesures mixtes (compte + %), l'une écraserait l'autre.
          label: (c: TooltipItem<ChartType>) => {
            const parsed: unknown = c.parsed
            const value = typeof parsed === 'number'
              ? parsed
              : typeof parsed === 'object' && parsed !== null && 'y' in parsed
                && typeof (parsed as { y?: unknown }).y === 'number'
                ? (parsed as { y: number }).y
                : Number(c.raw)
            const format = measures[c.datasetIndex]?.format
            return `${c.dataset.label ?? ''} : ${formatMeasure(value, format, intlLocale(locale))}`
          },
        },
      },
    },
    scales: kind === 'pie' || kind === 'doughnut' ? undefined : {
      x: { stacked, ticks: { color: tick }, grid: { color: grid } },
      y: { stacked, ticks: { color: tick }, grid: { color: grid } },
    },
  }

  if (kind === 'pie') return <Pie data={data} options={options} />
  if (kind === 'doughnut') return <Doughnut data={data} options={options} />
  if (kind === 'line' || kind === 'area') return <Line data={data} options={options} />
  return <Bar data={data} options={options} />
}
