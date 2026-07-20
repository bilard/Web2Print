// src/features/priceWatch/dashboard/CompetitorBars.tsx
// Écart de prix MOYEN par concurrent (concurrent vs mon prix HT). Barre rose quand le
// concurrent est en moyenne moins cher que moi (agressif), émeraude sinon. Barres
// horizontales → lisible avec beaucoup de concurrents, et responsive (mobile).
import { Bar } from 'react-chartjs-2'
import { Chart, BarElement, CategoryScale, LinearScale, Tooltip, type TooltipItem } from 'chart.js'
import { useThemeStore } from '@/stores/theme.store'
import type { CompetitorStat } from '../catalog/report'

Chart.register(BarElement, CategoryScale, LinearScale, Tooltip)

export function CompetitorBars({ stats }: { stats: CompetitorStat[] }) {
  const isLight = useThemeStore((s) => s.resolvedTheme === 'light')
  const grid = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'
  const tick = isLight ? '#475569' : 'rgba(255,255,255,0.6)'

  // Concurrents chiffrés uniquement, du plus agressif (écart le plus négatif) au moins.
  const rows = stats.filter((s) => s.avgGapPct != null).sort((a, b) => (a.avgGapPct ?? 0) - (b.avgGapPct ?? 0))
  const byId = new Map(rows.map((r) => [r.domain, r]))

  const data = {
    labels: rows.map((r) => r.domain),
    datasets: [{
      data: rows.map((r) => r.avgGapPct ?? 0),
      backgroundColor: rows.map((r) => ((r.avgGapPct ?? 0) < 0 ? '#fb7185' : '#34d399')),
      borderRadius: 4,
      barThickness: 16,
    }],
  }

  return (
    <div className="bg-surface rounded-lg p-4">
      <div className="text-sm font-semibold text-white mb-3">Écart moyen par concurrent</div>
      {rows.length === 0 ? (
        <div className="text-white/40 text-sm py-8 text-center">Pas encore de prix concurrents chiffrés.</div>
      ) : (
        <div style={{ height: Math.max(120, rows.length * 30 + 30) }}>
          <Bar
            data={data}
            options={{
              indexAxis: 'y',
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    label: (i: TooltipItem<'bar'>) => {
                      const r = byId.get(String(i.label))
                      const g = Math.round((i.parsed.x as number) * 10) / 10
                      return ` Écart moyen ${g > 0 ? '+' : ''}${g}% · ${r?.matched ?? 0} appariés · ${r?.cheaper ?? 0} moins chers`
                    },
                  },
                },
              },
              scales: {
                x: { grid: { color: grid }, ticks: { color: tick, callback: (v) => `${v}%` } },
                y: { grid: { display: false }, ticks: { color: tick, font: { size: 11 } } },
              },
            }}
          />
        </div>
      )}
    </div>
  )
}
