// src/features/priceWatch/dashboard/GapDistribution.tsx
// Distribution des écarts prix (concurrent vs moi) sur toutes les paires produit×
// concurrent. Chaque barre = une tranche d'écart, colorée diverging (rose = concurrent
// moins cher, ambre = aligné, émeraude = je suis moins cher). L'insight « où est la masse ».
import { Bar } from 'react-chartjs-2'
import { Chart, BarElement, CategoryScale, LinearScale, Tooltip, type TooltipItem } from 'chart.js'
import { useThemeStore } from '@/stores/theme.store'
import type { Cockpit, CockpitFilter } from './analytics'
import { POSITION_HEX } from './format'

Chart.register(BarElement, CategoryScale, LinearScale, Tooltip)

export function GapDistribution({ ck, onSelect, height = 190 }: { ck: Cockpit; onSelect?: (patch: Partial<CockpitFilter>) => void; height?: number }) {
  const isLight = useThemeStore((s) => s.resolvedTheme === 'light')
  const grid = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'
  const tick = isLight ? '#475569' : 'rgba(255,255,255,0.55)'
  const bins = ck.histogram
  const total = ck.gapValues.length

  const data = {
    labels: bins.map((b) => b.label),
    datasets: [{
      data: bins.map((b) => b.count),
      backgroundColor: bins.map((b) => POSITION_HEX[b.tone]),
      borderRadius: 3,
      maxBarThickness: 44,
    }],
  }

  return (
    <div className="bg-surface rounded-lg p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-sm font-semibold text-white">Distribution des écarts</div>
        <div className="text-[11px] text-white/35">
          {total} paires{ck.truncated ? ' · sur top 1000' : ''}
        </div>
      </div>
      {total === 0 ? (
        <div className="text-white/40 text-sm py-10 text-center">Pas encore de paires chiffrées.</div>
      ) : (
        <div style={{ height }}>
          <Bar
            data={data}
            options={{
              maintainAspectRatio: false,
              onClick: (_e, els) => { if (els[0] && onSelect) onSelect({ position: bins[els[0].index].tone }) },
              onHover: (e, els) => { const t = e.native?.target as HTMLElement | undefined; if (t) t.style.cursor = els[0] ? 'pointer' : 'default' },
              plugins: {
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    title: (items: TooltipItem<'bar'>[]) => `Écart ${items[0].label}`,
                    label: (i: TooltipItem<'bar'>) => {
                      const n = i.parsed.y as number
                      const share = total ? Math.round((n / total) * 100) : 0
                      return ` ${n} paire(s) · ${share}%`
                    },
                  },
                },
              },
              scales: {
                x: { grid: { display: false }, ticks: { color: tick, font: { size: 10 }, maxRotation: 0, autoSkip: false } },
                y: { grid: { color: grid }, ticks: { color: tick, precision: 0, font: { size: 10 } }, beginAtZero: true },
              },
            }}
          />
        </div>
      )}
    </div>
  )
}
