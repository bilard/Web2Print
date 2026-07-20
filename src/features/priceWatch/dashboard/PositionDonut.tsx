// src/features/priceWatch/dashboard/PositionDonut.tsx
// Répartition des comparaisons produit×concurrent chiffrées : concurrent moins cher /
// aligné / je suis moins cher. Donut chart.js (responsive → OK mobile).
import { Doughnut } from 'react-chartjs-2'
import { Chart, ArcElement, Tooltip, Legend, type TooltipItem } from 'chart.js'
import { useThemeStore } from '@/stores/theme.store'
import type { ReportKpis } from '../catalog/report'
import type { CockpitFilter } from './analytics'
import { POSITION_HEX, POSITION_LABEL } from './format'

Chart.register(ArcElement, Tooltip, Legend)

const TONES = ['cheaper', 'aligned', 'dearer'] as const

export function PositionDonut({ kpis, onSelect }: { kpis: ReportKpis; onSelect?: (patch: Partial<CockpitFilter>) => void }) {
  const isLight = useThemeStore((s) => s.resolvedTheme === 'light')
  const tick = isLight ? '#475569' : 'rgba(255,255,255,0.7)'
  const total = kpis.cheaperThanMe + kpis.aligned + kpis.dearerThanMe

  const data = {
    labels: [POSITION_LABEL.cheaper, POSITION_LABEL.aligned, POSITION_LABEL.dearer],
    datasets: [{
      data: [kpis.cheaperThanMe, kpis.aligned, kpis.dearerThanMe],
      backgroundColor: [POSITION_HEX.cheaper, POSITION_HEX.aligned, POSITION_HEX.dearer],
      borderWidth: 0,
    }],
  }

  return (
    <div className="bg-surface rounded-lg p-4">
      <div className="text-sm font-semibold text-white mb-3">Positionnement prix</div>
      {total === 0 ? (
        <div className="text-white/40 text-sm py-8 text-center">Aucune comparaison chiffrée.</div>
      ) : (
        <div className="mx-auto" style={{ maxWidth: 260 }}>
          <Doughnut
            data={data}
            options={{
              cutout: '62%',
              onClick: (_e, els) => { if (els[0] && onSelect) onSelect({ position: TONES[els[0].index] }) },
              onHover: (e, els) => { const t = e.native?.target as HTMLElement | undefined; if (t) t.style.cursor = els[0] ? 'pointer' : 'default' },
              plugins: {
                legend: { position: 'bottom', labels: { color: tick, boxWidth: 12, padding: 12, font: { size: 11 } } },
                tooltip: {
                  callbacks: {
                    label: (i: TooltipItem<'doughnut'>) => {
                      const v = i.parsed
                      return ` ${i.label} : ${v} (${Math.round((v / total) * 100)}%)`
                    },
                  },
                },
              },
            }}
          />
        </div>
      )}
    </div>
  )
}
