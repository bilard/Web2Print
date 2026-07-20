// src/features/priceWatch/dashboard/ProductList.tsx
// Liste complète des produits appariés, centrée produit (cartes dépliables). Recherche
// (nom/référence), filtre par concurrent et par position, pagination client. La liste
// persistée est déjà rangée + plafonnée ; l'exhaustif reste l'export Excel.
import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import type { StoredReport } from '../reportStore'
import { ProductCard } from './ProductCard'
import { foldText } from '../catalog/categories'

const PAGE = 60
type PosFilter = 'all' | 'undercut' | 'well-placed'

const selectCls = 'bg-well text-white/80 text-xs rounded px-2 py-1.5 border border-white/10 focus:outline-none focus:border-white/25'

export function ProductList({ report }: { report: StoredReport }) {
  const [q, setQ] = useState('')
  const [site, setSite] = useState('')
  const [pos, setPos] = useState<PosFilter>('all')
  const [shown, setShown] = useState(PAGE)

  const filtered = useMemo(() => {
    const needle = foldText(q.trim())
    return report.products.filter((p) => {
      if (pos === 'undercut' && !p.undercut) return false
      if (pos === 'well-placed' && p.undercut) return false
      if (site && !p.competitors.some((c) => c.domain === site)) return false
      if (needle) {
        const hay = foldText(`${p.name} ${p.reference ?? ''} ${p.ean ?? ''}`)
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [report.products, q, site, pos])

  const visible = filtered.slice(0, shown)

  return (
    <section data-pw-section="comparison" className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-white">Tous les produits ({filtered.length})</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-white/30 absolute left-2 top-1/2 -translate-y-1/2" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE) }}
              placeholder="Rechercher…" className={`${selectCls} pl-7 w-40`} />
          </div>
          <select value={pos} onChange={(e) => { setPos(e.target.value as PosFilter); setShown(PAGE) }} className={selectCls}>
            <option value="all">Toutes positions</option>
            <option value="undercut">Concurrent moins cher</option>
            <option value="well-placed">Je suis bien placé</option>
          </select>
          <select value={site} onChange={(e) => { setSite(e.target.value); setShown(PAGE) }} className={selectCls}>
            <option value="">Tous concurrents</option>
            {report.sites.map((s) => <option key={s.siteId} value={s.domain}>{s.domain}</option>)}
          </select>
        </div>
      </div>

      {report.truncated && (
        <p className="text-xs text-amber-400/80">
          Liste limitée aux {report.products.length} produits les plus significatifs sur {report.totalMatched} appariés — l'export Excel du workflow contient l'exhaustif.
        </p>
      )}

      <div className="space-y-1.5">
        {visible.map((row) => <ProductCard key={row.id} row={row} />)}
        {filtered.length === 0 && <div className="text-white/40 text-sm py-6 text-center">Aucun produit ne correspond aux filtres.</div>}
      </div>

      {shown < filtered.length && (
        <button type="button" onClick={() => setShown((n) => n + PAGE)}
          className="w-full text-xs text-white/60 hover:text-white bg-surface hover:bg-surface-2 rounded-lg py-2 transition-colors">
          Afficher {Math.min(PAGE, filtered.length - shown)} de plus
        </button>
      )}
    </section>
  )
}
