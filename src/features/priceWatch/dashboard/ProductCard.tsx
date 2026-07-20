// src/features/priceWatch/dashboard/ProductCard.tsx
// Carte CENTRÉE PRODUIT (pas de table large → directement adaptée mobile). Repliée :
// identité + mon prix + meilleur écart concurrent (badge). Dépliée : le détail de
// chaque concurrent apparié (prix TTC/HT, barré, écart, stock, type d'appariement,
// image, lien). L'image + le nom concurrent servent à vérifier le bon appariement.
import { useState } from 'react'
import { ChevronDown, ExternalLink } from 'lucide-react'
import type { ProductRow } from '../catalog/report'
import { eur, pct, positionOf, POSITION_TEXT, STOCK_LABEL, MATCH_LABEL } from './format'

function GapBadge({ gap }: { gap: number | null }) {
  const pos = positionOf(gap)
  if (!pos) return <span className="text-white/30 text-xs">—</span>
  return <span className={`text-xs font-medium ${POSITION_TEXT[pos]}`}>{pct(gap)}</span>
}

function Thumb({ src, alt }: { src: string | null; alt: string }) {
  if (!src) return <div className="w-10 h-10 rounded bg-well shrink-0" />
  return (
    <img src={src} alt={alt} loading="lazy" className="w-10 h-10 rounded object-cover bg-well shrink-0"
      onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }} />
  )
}

export function ProductCard({ row }: { row: ProductRow }) {
  const [open, setOpen] = useState(false)
  const best = row.competitors.reduce<number | null>((m, c) => (c.gapPct != null && (m == null || c.gapPct < m) ? c.gapPct : m), null)

  return (
    <div className="bg-surface rounded-lg overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2 transition-colors">
        <ChevronDown className={`w-4 h-4 text-white/40 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        <div className="min-w-0 flex-1">
          <div className="text-sm text-white truncate">{row.name}</div>
          <div className="text-xs text-white/40 truncate">
            {row.reference ?? '—'}{row.famille ? ` · ${row.famille}` : ''} · {row.competitors.length} concurrent(s)
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs text-white/50">{eur(row.myPriceHt)} <span className="text-white/30">HT</span></div>
          <GapBadge gap={best} />
        </div>
      </button>

      {open && (
        <div className="divide-y divide-white/5 border-t border-white/5">
          {row.competitors.map((c) => (
            <div key={c.siteId} className="flex items-center gap-3 px-3 py-2">
              <Thumb src={c.image} alt={c.name} />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-white/80 truncate">{c.domain}</div>
                <div className="text-[11px] text-white/40 truncate" title={c.name}>{c.name}</div>
                <div className="text-[11px] text-white/40">
                  {MATCH_LABEL[c.match]}{c.stock ? ` · ${STOCK_LABEL[c.stock]}` : ''}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm text-white">
                  {eur(c.priceTtc)} <span className="text-white/30 text-[10px]">TTC</span>
                  {c.listPriceTtc != null && c.listPriceTtc > (c.priceTtc ?? 0) && (
                    <span className="ml-1 text-white/30 line-through text-[10px]">{eur(c.listPriceTtc)}</span>
                  )}
                </div>
                <div className="flex items-center justify-end gap-2">
                  <span className="text-[11px] text-white/40">{eur(c.priceHt)} HT</span>
                  <GapBadge gap={c.gapPct} />
                  <a href={c.url} target="_blank" rel="noreferrer" className="text-white/40 hover:text-white" title="Ouvrir la fiche">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
