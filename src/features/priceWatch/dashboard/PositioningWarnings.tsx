// src/features/priceWatch/dashboard/PositioningWarnings.tsx
// Bloc HÉRO des alertes. Priorité métier n°1 : les produits où un concurrent est moins
// cher que vous (rangés par écart le plus fort). Secondaire : ruptures concurrentes =
// opportunités de vente. Les produits sont déjà rangés (les plus sous-cotés en tête).
import { AlertTriangle, PackageX } from 'lucide-react'
import type { StoredReport } from '../reportStore'
import { ProductCard } from './ProductCard'
import { eur } from './format'

const UNDERCUT_SHOWN = 8
const RUPTURE_SHOWN = 6

export function PositioningWarnings({ report }: { report: StoredReport }) {
  const undercut = report.products.filter((p) => p.undercut)
  const ruptures = report.products
    .flatMap((p) => p.competitors.filter((c) => c.stock === 'out-of-stock').map((c) => ({ p, c })))
    .slice(0, RUPTURE_SHOWN)

  if (undercut.length === 0 && ruptures.length === 0) {
    return (
      <div className="bg-surface rounded-lg p-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="text-sm text-white/70">Aucun concurrent moins cher que vous sur les produits appariés. Bon positionnement.</div>
      </div>
    )
  }

  return (
    <div className="space-y-4" data-pw-section="warnings">
      {undercut.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            Concurrents moins chers que vous
            <span className="text-rose-400/80 font-normal">({report.kpis.productsUndercut})</span>
          </h3>
          <div className="space-y-1.5">
            {undercut.slice(0, UNDERCUT_SHOWN).map((row) => <ProductCard key={row.id} row={row} />)}
          </div>
          {undercut.length > UNDERCUT_SHOWN && (
            <p className="mt-2 text-xs text-white/40">
              +{undercut.length - UNDERCUT_SHOWN} autres produits sous-cotés — voir la liste complète ci-dessous.
            </p>
          )}
        </section>
      )}

      {ruptures.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
            <PackageX className="w-4 h-4 text-amber-400" />
            Ruptures concurrentes <span className="text-amber-400/80 font-normal">(opportunités)</span>
          </h3>
          <ul className="divide-y divide-white/5 rounded-lg bg-surface">
            {ruptures.map(({ p, c }) => (
              <li key={`${p.id}__${c.siteId}`} className="flex items-center justify-between px-3 py-2 text-sm gap-3">
                <span className="min-w-0 flex-1 truncate text-white/80">{p.name}</span>
                <span className="text-white/40 text-xs shrink-0">{c.domain}</span>
                <a href={c.url} target="_blank" rel="noreferrer" className="text-white/50 hover:text-white text-xs shrink-0 underline">
                  {eur(c.priceTtc)}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
