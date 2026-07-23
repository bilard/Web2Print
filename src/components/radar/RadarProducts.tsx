import { useMemo, useState } from 'react'
import { Search, ExternalLink } from 'lucide-react'
import type { ProductRow } from '@/features/priceWatch/catalog/report'
import { matchesQuery } from '@/features/priceWatch/dashboard/analytics'
import { fmtEur, fmtGapPct } from '@/features/priceWatch/radar/radarFormat'

const CAP = 40

const stockDot: Record<string, string> = {
  'in-stock': 'var(--radar-good)', 'out-of-stock': 'var(--radar-bad)', 'on-order': 'var(--radar-warn)',
}

function ProductCard({ p }: { p: ProductRow }) {
  const comps = [...p.competitors].sort((a, b) => (a.priceHt ?? Infinity) - (b.priceHt ?? Infinity))
  return (
    <li className="radar-card px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium">{p.name}</p>
          <p className="mt-0.5 truncate text-[11px]" style={{ color: 'var(--radar-text-3)' }}>
            {p.reference ?? '—'}{p.famille ? ` · ${p.famille}` : ''}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="radar-tnum text-[14px] font-semibold">{fmtEur(p.myPriceHt)}</p>
          {p.bestGapPct != null && (
            <p className="radar-tnum text-[11px]" style={{ color: p.undercut ? 'var(--radar-bad)' : 'var(--radar-good)' }}>{fmtGapPct(p.bestGapPct)}</p>
          )}
        </div>
      </div>
      <ul className="mt-2 space-y-1 border-t pt-2" style={{ borderColor: 'var(--radar-hair)' }}>
        {comps.slice(0, 5).map((c) => (
          <li key={c.siteId} className="flex items-center gap-2 text-[11.5px]">
            {c.stock && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: stockDot[c.stock] ?? 'var(--radar-text-3)' }} />}
            <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--radar-text-2)' }}>{c.domain}</span>
            <span className="radar-tnum shrink-0">{fmtEur(c.priceHt)}</span>
            {c.gapPct != null && (
              <span className="radar-tnum w-11 shrink-0 text-right" style={{ color: c.gapPct < 0 ? 'var(--radar-bad)' : 'var(--radar-good)' }}>{fmtGapPct(c.gapPct)}</span>
            )}
            {c.url && (
              <a href={c.url} target="_blank" rel="noreferrer" className="radar-tap shrink-0" style={{ color: 'var(--radar-text-3)' }} aria-label="Ouvrir la fiche concurrent">
                <ExternalLink size={12} />
              </a>
            )}
          </li>
        ))}
        {comps.length > 5 && <li className="text-[10.5px]" style={{ color: 'var(--radar-text-3)' }}>+{comps.length - 5} autre(s) concurrent(s)</li>}
      </ul>
    </li>
  )
}

/** Détail produits : recherche full-text + carte par produit (mon prix, relevés concurrents, liens). */
export function RadarProducts({ products }: { products: ProductRow[] }) {
  const [q, setQ] = useState('')
  const filtered = useMemo(() => products.filter((p) => matchesQuery(p, q)), [products, q])
  const shown = filtered.slice(0, CAP)

  return (
    <div className="space-y-3">
      <div className="radar-inset flex items-center gap-2 px-3 py-2">
        <Search size={15} color="var(--radar-text-3)" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un produit, une référence…"
          className="w-full bg-transparent text-[14px] outline-none placeholder:text-[var(--radar-text-3)]"
          style={{ color: 'var(--radar-text)' }}
        />
      </div>
      <p className="px-1 text-[11px]" style={{ color: 'var(--radar-text-3)' }}>
        {fmtCount(filtered.length)}{filtered.length > CAP ? ` · ${CAP} affichés` : ''}
      </p>
      <ul className="space-y-3 landscape:columns-2 landscape:gap-3 landscape:space-y-0 landscape:[&>*]:mb-3 landscape:[&>*]:break-inside-avoid">
        {shown.map((p) => <ProductCard key={p.id} p={p} />)}
      </ul>
      {filtered.length === 0 && (
        <p className="py-8 text-center text-[13px]" style={{ color: 'var(--radar-text-2)' }}>Aucun produit ne correspond.</p>
      )}
    </div>
  )
}

function fmtCount(n: number): string {
  return `${n.toLocaleString('fr-FR')} produit${n > 1 ? 's' : ''}`
}
