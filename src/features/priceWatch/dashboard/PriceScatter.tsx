// src/features/priceWatch/dashboard/PriceScatter.tsx
// Nuage de points : mon prix HT (x) × meilleur écart concurrent (y). Repère les zones —
// produits chers ET battus (bas-droite = à corriger). Couleur diverging par position.
import { Scatter } from 'react-chartjs-2'
import { Chart, PointElement, LinearScale, Tooltip, Legend, type TooltipItem } from 'chart.js'
import { useThemeStore } from '@/stores/theme.store'
import type { Cockpit, CockpitFilter } from './analytics'
import { POSITION_HEX, POSITION_LABEL } from './format'

Chart.register(PointElement, LinearScale, Tooltip, Legend)

const TONES = ['cheaper', 'aligned', 'dearer'] as const

// `height` : fournie en modale (agrandi) ; absente en grille → la carte remplit la rangée.
export function PriceScatter({ ck, onSelect, height }: { ck: Cockpit; onSelect?: (patch: Partial<CockpitFilter>) => void; height?: number }) {
  const isLight = useThemeStore((s) => s.resolvedTheme === 'light')
  const grid = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'
  const tick = isLight ? '#475569' : 'rgba(255,255,255,0.55)'
  const pts = ck.scatter
  const r = pts.length > 300 ? 2 : pts.length > 120 ? 2.5 : 3.5
  const alpha = pts.length > 300 ? 'aa' : 'ee'

  const data = {
    datasets: TONES.map((t) => ({
      label: POSITION_LABEL[t],
      data: pts.filter((p) => p.tone === t).map((p) => ({ x: p.x, y: p.y, name: p.name })),
      backgroundColor: POSITION_HEX[t] + alpha,
      pointRadius: r,
      pointHoverRadius: r + 2,
    })),
  }

  return (
    // h-full + flex-col : dans la grille items-stretch, le nuage occupe TOUTE la hauteur
    // de la carte (alignée sur la heatmap voisine) ; en modale, `height` explicite prime.
    <div className="bg-surface rounded-lg p-4 h-full flex flex-col">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-sm font-semibold text-white">Prix × écart concurrent</div>
        <div className="text-[11px] text-white/35">{pts.length} produits{ck.truncated ? ' · top 1000' : ''}</div>
      </div>
      {pts.length === 0 ? (
        <div className="text-white/40 text-sm py-10 text-center">Aucun produit chiffré dans la vue.</div>
      ) : (
        <div className="flex-1 min-h-[240px]" style={height != null ? { height, flex: 'none' } : undefined}>
          <Scatter
            data={data}
            options={{
              maintainAspectRatio: false,
              onClick: (_e, els) => { if (els[0] && onSelect) onSelect({ position: TONES[els[0].datasetIndex] }) },
              onHover: (e, els) => { const t = e.native?.target as HTMLElement | undefined; if (t) t.style.cursor = els[0] ? 'pointer' : 'default' },
              plugins: {
                legend: { position: 'bottom', labels: { color: tick, boxWidth: 8, boxHeight: 8, font: { size: 10 }, usePointStyle: true } },
                tooltip: {
                  callbacks: {
                    label: (i: TooltipItem<'scatter'>) => {
                      const d = i.raw as { x: number; y: number; name: string }
                      const g = Math.round(d.y * 10) / 10
                      return ` ${d.name} · ${d.x.toLocaleString('fr-FR')} € · ${g > 0 ? '+' : ''}${g}%`
                    },
                  },
                },
              },
              scales: {
                x: { grid: { color: grid }, ticks: { color: tick, font: { size: 10 }, callback: (v) => `${v}€` }, title: { display: true, text: 'Mon prix HT', color: tick, font: { size: 10 } } },
                y: { grid: { color: grid }, ticks: { color: tick, font: { size: 10 }, callback: (v) => `${v}%` }, title: { display: true, text: 'Écart concurrent', color: tick, font: { size: 10 } } },
              },
            }}
          />
        </div>
      )}
    </div>
  )
}
