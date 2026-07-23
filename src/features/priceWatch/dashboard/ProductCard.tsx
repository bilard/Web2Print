// src/features/priceWatch/dashboard/ProductCard.tsx
// Carte CENTRÉE PRODUIT (pas de table large → directement adaptée mobile). Repliée :
// identité + mon prix + meilleur écart concurrent (badge). Dépliée : le détail de
// chaque concurrent apparié (prix TTC/HT, barré, écart, stock, type d'appariement,
// image, lien). L'image + le nom concurrent servent à vérifier le bon appariement.
import { useState } from 'react'
import { ChevronDown, ImageOff } from 'lucide-react'
import type { ProductRow } from '../catalog/report'
import { useResolvedImage } from '@/features/catalog/useResolvedImage'
import { eur, pct, positionOf, POSITION_TEXT, STOCK_LABEL, MATCH_LABEL } from './format'

function GapBadge({ gap }: { gap: number | null }) {
  const pos = positionOf(gap)
  if (!pos) return <span className="text-white/30 text-xs">—</span>
  return <span className={`text-xs font-medium ${POSITION_TEXT[pos]}`}>{pct(gap)}</span>
}

// L'URL de l'image concurrent est souvent protégée contre le hotlink (référent) ou
// sans CORS : on la résout via le proxy serveur (data-URI, cache). Rendue seulement
// à l'ouverture d'une carte → 1-3 requêtes à la fois. À défaut d'URL ou en échec :
// placeholder neutre (jamais un carré noir).
function Thumb({ src, alt }: { src: string | null; alt: string }) {
  const { src: resolved, resolving } = useResolvedImage(src)
  const base = 'w-10 h-10 rounded bg-well shrink-0'
  if (src && resolving) return <div className={`${base} animate-pulse`} />
  if (resolved) return <img src={resolved} alt={alt} loading="lazy" className={`${base} object-cover`} />
  return <div className={`${base} flex items-center justify-center`}><ImageOff className="w-4 h-4 text-white/20" /></div>
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
                {/* Domaine + nom cliquables → fiche du concurrent (l'icône ⧉ seule était
                    trop discrète, demande utilisateur). */}
                {c.url ? (
                  <a href={c.url} target="_blank" rel="noreferrer" title={`Ouvrir la fiche sur ${c.domain}`} className="block group/link">
                    <div className="text-xs text-white/80 truncate group-hover/link:text-indigo-300 group-hover/link:underline">{c.domain}</div>
                    <div className="text-[11px] text-white/40 truncate group-hover/link:text-white/60">{c.name}</div>
                  </a>
                ) : (
                  <>
                    <div className="text-xs text-white/80 truncate">{c.domain}</div>
                    <div className="text-[11px] text-white/40 truncate" title={c.name}>{c.name}</div>
                  </>
                )}
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
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
