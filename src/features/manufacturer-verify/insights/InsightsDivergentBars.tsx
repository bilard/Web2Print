import { Bar } from 'react-chartjs-2'
import { Chart, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js'
import { useThemeStore } from '@/stores/theme.store'
import type { FieldStat } from './insightsAggregate'
import { STATUS_UI } from './insightsStatus'
import { t } from '@/lib/i18n'

Chart.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend)

interface Props {
  fields: FieldStat[]
}

/** Barres horizontales : les champs qui divergent le plus (source ≠ fabricant),
 *  empilées avec l'apport fabricant pour visualiser les DEUX types d'écart. */
export function InsightsDivergentBars({ fields }: Props) {
  const isLight = useThemeStore((s) => s.resolvedTheme === 'light')
  const grid = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'
  const tick = isLight ? '#475569' : 'rgba(255,255,255,0.65)'

  const top = [...fields]
    .filter((f) => f.counts.diff > 0 || f.counts['mfr-only'] > 0)
    .sort((a, b) => b.counts.diff - a.counts.diff || b.counts['mfr-only'] - a.counts['mfr-only'])
    .slice(0, 12)

  const data = {
    labels: top.map((f) => f.label),
    datasets: [
      { label: STATUS_UI.diff.label, data: top.map((f) => f.counts.diff), backgroundColor: STATUS_UI.diff.hex, stack: 's' },
      { label: STATUS_UI['mfr-only'].label, data: top.map((f) => f.counts['mfr-only']), backgroundColor: STATUS_UI['mfr-only'].hex, stack: 's' },
    ],
  }
  const options = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const,
    plugins: { legend: { labels: { color: tick, boxWidth: 12 } } },
    scales: {
      x: { stacked: true, grid: { color: grid }, ticks: { color: tick, precision: 0 }, beginAtZero: true },
      y: { stacked: true, grid: { display: false }, ticks: { color: tick } },
    },
  }
  return (
    <div className="bg-surface border border-white/10 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-white/80 mb-3">{t('mv.insights.topDivergent')}</h3>
      {top.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-sm text-white/40">
          Aucun écart détecté sur les produits vérifiés.
        </div>
      ) : (
        <div style={{ height: `${Math.max(256, top.length * 30)}px` }}>
          <Bar data={data} options={options} />
        </div>
      )}
    </div>
  )
}
