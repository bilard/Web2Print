import { Grid3x3 } from 'lucide-react'
import type { Cockpit } from '@/features/priceWatch/dashboard/analytics'

/** Couleur de cellule : rouge = concurrent moins cher (gap<0), vert = je suis moins cher. */
function cellBg(gap: number | null): string {
  if (gap == null) return 'transparent'
  const a = Math.min(0.85, 0.12 + Math.abs(gap) / 45)
  return gap < 0 ? `rgba(255,69,58,${a})` : `rgba(48,209,88,${a})`
}

/** Heatmap écart moyen concurrent × famille (défilable horizontalement). */
export function RadarHeatmap({ cockpit }: { cockpit: Cockpit }) {
  const { heatmap, familyKeys, competitors } = cockpit
  const rows = competitors.filter((c) => c.matched > 0)
  if (rows.length === 0 || familyKeys.length === 0) return null
  return (
    <section className="radar-card radar-in px-4 py-4">
      <div className="mb-3 flex items-center gap-2">
        <Grid3x3 size={16} color="var(--radar-accent-2)" />
        <h2 className="text-[15px] font-semibold">Heatmap familles</h2>
        <span className="ml-auto text-[12px]" style={{ color: 'var(--radar-text-3)' }}>écart moyen</span>
      </div>
      <div className="radar-noscroll overflow-x-auto">
        <table className="border-separate" style={{ borderSpacing: '3px' }}>
          <thead>
            <tr>
              <th />
              {familyKeys.map((f) => (
                <th key={f} className="max-w-[54px] truncate px-1 pb-1 text-[9.5px] font-medium" style={{ color: 'var(--radar-text-3)' }} title={f}>{f}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.siteId}>
                <td className="max-w-[92px] truncate pr-2 text-[11px] font-medium" title={c.domain}>{c.domain}</td>
                {familyKeys.map((f) => {
                  const cell = heatmap[c.siteId]?.[f]
                  const gap = cell?.avgGapPct ?? null
                  return (
                    <td key={f} className="radar-tnum h-8 w-[46px] rounded text-center text-[10px]" style={{ background: cellBg(gap), color: gap != null ? 'var(--radar-text)' : 'var(--radar-text-3)' }}>
                      {gap != null ? Math.round(gap) : '·'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
