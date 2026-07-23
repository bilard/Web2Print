import { ScatterChart } from 'lucide-react'
import type { Cockpit } from '@/features/priceWatch/dashboard/analytics'

const toneColor = (tone: 'cheaper' | 'aligned' | 'dearer'): string =>
  tone === 'cheaper' ? 'var(--radar-bad)' : tone === 'dearer' ? 'var(--radar-good)' : 'var(--radar-warn)'

/** Nuage de points prix (x) × écart % (y) : un point par produit chiffré. Repère y=0 (aligné). */
export function RadarScatter({ cockpit }: { cockpit: Cockpit }) {
  const pts = cockpit.scatter
  if (pts.length === 0) return null
  const W = 100, H = 64, YCLAMP = 60
  // x : prix, borné au 95e centile pour que les outliers n'écrasent pas le nuage.
  const prices = pts.map((p) => p.x).sort((a, b) => a - b)
  const xMax = Math.max(1, prices[Math.floor(prices.length * 0.95)] ?? prices[prices.length - 1])
  const sx = (x: number) => Math.min(1, x / xMax) * (W - 4) + 2
  const sy = (y: number) => H / 2 - (Math.max(-YCLAMP, Math.min(YCLAMP, y)) / YCLAMP) * (H / 2 - 3)
  const sample = pts.length > 400 ? pts.filter((_, i) => i % Math.ceil(pts.length / 400) === 0) : pts

  return (
    <section className="radar-card radar-in px-4 py-4">
      <div className="mb-2 flex items-center gap-2">
        <ScatterChart size={16} color="var(--radar-accent-2)" />
        <h2 className="text-[15px] font-semibold">Prix × écart</h2>
        <span className="ml-auto text-[12px]" style={{ color: 'var(--radar-text-3)' }}>{sample.length} produits</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 150 }} preserveAspectRatio="none">
        <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="var(--radar-hair-2)" strokeWidth="0.4" strokeDasharray="2 2" />
        {sample.map((p, i) => (
          <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={0.9} fill={toneColor(p.tone)} opacity="0.75" />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[10px]" style={{ color: 'var(--radar-text-3)' }}>
        <span>0 €</span><span>ligne = aligné (0 %)</span><span>{Math.round(xMax)} €+</span>
      </div>
    </section>
  )
}
