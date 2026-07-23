import { Layers } from 'lucide-react'
import type { Cockpit } from '@/features/priceWatch/dashboard/analytics'
import { fmtGapPct, fmtInt } from '@/features/priceWatch/radar/radarFormat'

/** Familles du catalogue : produits, part sous-cotée (un concurrent me bat), écart moyen. */
export function RadarFamilies({ cockpit }: { cockpit: Cockpit }) {
  const items = cockpit.families
  if (items.length === 0) return null
  const maxFam = Math.max(1, ...items.map((f) => f.products))
  return (
    <section className="radar-card radar-in px-4 py-4">
      <div className="mb-2 flex items-center gap-2">
        <Layers size={16} color="var(--radar-accent-2)" />
        <h2 className="text-[15px] font-semibold">Familles</h2>
        <span className="ml-auto text-[12px]" style={{ color: 'var(--radar-text-3)' }}>sous-cotés · écart moy</span>
      </div>
      <ul className="space-y-3">
        {items.map((f) => {
          const rate = f.products > 0 ? (f.undercut / f.products) * 100 : 0
          return (
            <li key={f.famille}>
              <div className="flex items-center justify-between text-[13px]">
                <span className="truncate pr-2 font-medium">{f.famille}</span>
                <span className="radar-tnum shrink-0" style={{ color: 'var(--radar-text-2)' }}>
                  <span style={{ color: f.undercut ? 'var(--radar-bad)' : 'var(--radar-text-3)' }}>{fmtInt(f.undercut)}</span>/{fmtInt(f.products)}
                  <span style={{ color: 'var(--radar-text-3)' }}> · {fmtGapPct(f.avgGapPct)}</span>
                </span>
              </div>
              {/* Barre : longueur = volume produits ; portion rouge = part sous-cotée. */}
              <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--radar-surface-2)' }}>
                <div className="h-full rounded-full" style={{ width: `${(f.products / maxFam) * 100}%`, background: 'var(--radar-accent)' }}>
                  <div className="h-full rounded-full" style={{ width: `${rate}%`, background: 'var(--radar-bad)' }} />
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
