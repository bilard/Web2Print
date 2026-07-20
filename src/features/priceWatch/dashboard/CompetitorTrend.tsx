// src/features/priceWatch/dashboard/CompetitorTrend.tsx
// Flux des écarts de prix par concurrent dans le temps (écart moyen FIABLE / analyse).
// Une ligne = un concurrent (catégoriel, ordre fixe par siteId + légende). `null` = trou
// (concurrent absent d'une analyse), jamais 0. Ne se peuple qu'aux analyses répétées.
import { Line } from 'react-chartjs-2'
import { Chart, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend } from 'chart.js'
import { useThemeStore } from '@/stores/theme.store'
import type { KpiHistoryPoint } from '../reportStore'
import { competitorSeries } from './analytics'
import { when } from './format'

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

// Palette catégorielle fixe (assignée par index de concurrent, jamais recyclée).
const CAT = ['#818cf8', '#38bdf8', '#fbbf24', '#34d399', '#fb7185', '#c084fc', '#2dd4bf', '#fb923c']

export function CompetitorTrend({ history, sites }: {
  history: KpiHistoryPoint[]; sites: { siteId: string; domain: string }[]
}) {
  const isLight = useThemeStore((s) => s.resolvedTheme === 'light')
  const grid = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'
  const tick = isLight ? '#475569' : 'rgba(255,255,255,0.55)'
  const { at, series } = competitorSeries(history, sites)
  const enough = at.length >= 2

  const data = {
    labels: at.map((t) => when(t)),
    datasets: series.slice(0, CAT.length).map((s, i) => ({
      label: s.domain.replace(/^www\./, ''),
      data: s.points,
      borderColor: CAT[i],
      backgroundColor: CAT[i],
      borderWidth: 2,
      pointRadius: 2,
      tension: 0.25,
      spanGaps: false, // null = trou visible
    })),
  }

  return (
    <div className="bg-surface rounded-lg p-4 h-full">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-sm font-semibold text-white">Flux des écarts par concurrent</div>
        <div className="text-[11px] text-white/35">écart moyen %</div>
      </div>
      {!enough ? (
        <div className="text-white/40 text-sm py-12 text-center px-4">
          La courbe se construit à chaque analyse. Relance le comparatif régulièrement
          (ou planifie-le) pour suivre l’évolution des prix concurrents dans le temps.
        </div>
      ) : (
        <div style={{ height: 220 }}>
          <Line
            data={data}
            options={{
              maintainAspectRatio: false,
              interaction: { mode: 'index', intersect: false },
              plugins: {
                legend: { position: 'bottom', labels: { color: tick, boxWidth: 10, boxHeight: 2, font: { size: 10 } } },
              },
              scales: {
                x: { grid: { display: false }, ticks: { color: tick, font: { size: 9 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
                y: { grid: { color: grid }, ticks: { color: tick, font: { size: 10 }, callback: (v) => `${v}%` } },
              },
            }}
          />
        </div>
      )}
    </div>
  )
}
