// src/features/analytics/admin/AnalyticsTimeChart.tsx
import { Line } from 'react-chartjs-2'
import {
  Chart,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
  type TooltipItem,
} from 'chart.js'
import { useThemeStore } from '@/stores/theme.store'
import { parseDayKey } from '../metrics'

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

interface Props {
  series: { day: string; pageViews: number; visitors: number }[]
}

const axisFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })
const fullFmt = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

export function AnalyticsTimeChart({ series }: Props) {
  const isLight = useThemeStore((s) => s.resolvedTheme === 'light')
  const grid = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'
  const tick = isLight ? '#475569' : 'rgba(255,255,255,0.55)'
  const data = {
    labels: series.map((p) => axisFmt.format(parseDayKey(p.day))),
    datasets: [
      {
        label: 'Pages vues',
        data: series.map((p) => p.pageViews),
        borderColor: '#6366f1',
        backgroundColor: '#6366f155',
        fill: true,
        tension: 0.3,
      },
      {
        label: 'Visiteurs',
        data: series.map((p) => p.visitors),
        borderColor: '#22d3ee',
        backgroundColor: 'transparent',
        tension: 0.3,
      },
    ],
  }
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const,
    plugins: {
      legend: { labels: { color: tick } },
      tooltip: {
        callbacks: {
          title: (items: TooltipItem<'line'>[]) => fullFmt.format(parseDayKey(series[items[0].dataIndex].day)),
        },
      },
    },
    scales: {
      x: { grid: { color: grid }, ticks: { color: tick } },
      y: { grid: { color: grid }, ticks: { color: tick }, beginAtZero: true },
    },
  }
  return (
    <div className="h-64 bg-surface rounded-lg p-4">
      <Line data={data} options={options} />
    </div>
  )
}
