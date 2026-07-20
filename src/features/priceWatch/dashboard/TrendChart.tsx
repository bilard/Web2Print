// src/features/priceWatch/dashboard/TrendChart.tsx
// Tendance dans le temps : nb de produits où un concurrent est moins cher que moi, et
// où je suis bien placé. Se remplit à chaque analyse. Dégrade proprement à 1 point.
import { Line } from 'react-chartjs-2'
import { Chart, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler } from 'chart.js'
import { useThemeStore } from '@/stores/theme.store'
import type { KpiHistoryPoint } from '../reportStore'

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

const dayFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })

export function TrendChart({ history }: { history: KpiHistoryPoint[] }) {
  const isLight = useThemeStore((s) => s.resolvedTheme === 'light')
  const grid = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'
  const tick = isLight ? '#475569' : 'rgba(255,255,255,0.55)'

  const data = {
    labels: history.map((p) => dayFmt.format(p.at)),
    datasets: [
      { label: 'Moins chers que vous', data: history.map((p) => p.productsUndercut), borderColor: '#fb7185', backgroundColor: '#fb718533', fill: true, tension: 0.3, pointRadius: history.length > 20 ? 0 : 3 },
      { label: 'Vous êtes bien placé', data: history.map((p) => p.products - p.productsUndercut), borderColor: '#34d399', backgroundColor: 'transparent', tension: 0.3, pointRadius: history.length > 20 ? 0 : 3 },
    ],
  }

  return (
    <div className="bg-surface rounded-lg p-4">
      <div className="text-sm font-semibold text-white mb-3">Tendance</div>
      {history.length < 2 ? (
        <div className="text-white/40 text-sm py-8 text-center">
          La tendance apparaît après plusieurs analyses (une courbe par exécution du comparatif).
        </div>
      ) : (
        <div style={{ height: 200 }}>
          <Line
            data={data}
            options={{
              maintainAspectRatio: false,
              interaction: { mode: 'index', intersect: false },
              plugins: { legend: { position: 'bottom', labels: { color: tick, boxWidth: 12, padding: 12, font: { size: 11 } } } },
              scales: {
                x: { grid: { color: grid }, ticks: { color: tick, maxRotation: 0, autoSkip: true, font: { size: 10 } } },
                y: { grid: { color: grid }, ticks: { color: tick, precision: 0 }, beginAtZero: true },
              },
            }}
          />
        </div>
      )}
    </div>
  )
}
