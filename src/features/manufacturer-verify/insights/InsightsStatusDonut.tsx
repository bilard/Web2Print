import { Doughnut } from 'react-chartjs-2'
import { Chart, ArcElement, Tooltip, Legend } from 'chart.js'
import { useThemeStore } from '@/stores/theme.store'
import type { StatusCounts } from './insightsAggregate'
import { STATUS_ORDER, STATUS_UI } from './insightsStatus'

Chart.register(ArcElement, Tooltip, Legend)

interface Props {
  title: string
  counts: StatusCounts
}

/** Anneau de répartition des statuts d'un ensemble de champs comparés. */
export function InsightsStatusDonut({ title, counts }: Props) {
  const isLight = useThemeStore((s) => s.resolvedTheme === 'light')
  const tick = isLight ? '#475569' : 'rgba(255,255,255,0.65)'
  const total = STATUS_ORDER.reduce((n, s) => n + counts[s], 0)

  const data = {
    labels: STATUS_ORDER.map((s) => STATUS_UI[s].label),
    datasets: [
      {
        data: STATUS_ORDER.map((s) => counts[s]),
        backgroundColor: STATUS_ORDER.map((s) => STATUS_UI[s].hex),
        borderColor: isLight ? '#fff' : '#0b0f1a',
        borderWidth: 2,
      },
    ],
  }
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const,
    cutout: '62%',
    plugins: {
      legend: { position: 'bottom' as const, labels: { color: tick, boxWidth: 12, padding: 12 } },
      tooltip: {
        callbacks: {
          label: (i: { label: string; parsed: number }) =>
            `${i.label} : ${i.parsed} (${total > 0 ? Math.round((i.parsed / total) * 100) : 0}%)`,
        },
      },
    },
  }
  return (
    <div className="bg-surface border border-white/10 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-white/80 mb-3">{title}</h3>
      <div className="h-64 relative">
        <Doughnut data={data} options={options} />
        <div className="absolute inset-0 top-[-2rem] flex flex-col items-center justify-center pointer-events-none">
          <div className="text-3xl font-bold tabular-nums">{total}</div>
          <div className="text-xs text-white/45">champs comparés</div>
        </div>
      </div>
    </div>
  )
}
