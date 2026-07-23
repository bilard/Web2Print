// src/features/priceWatch/dashboard/SearchAutocomplete.tsx
// Moteur de recherche global du cockpit avec AUTOCOMPLÉTION : suggère en frappant des
// familles (→ filtre famille) et des produits (nom · réf, → requête précise). Full-text
// insensible aux accents via matchesQuery. Navigation clavier ↑ ↓ Entrée Échap.
import { useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import type { ProductRow } from '../catalog/report'
import { matchesQuery } from './analytics'
import { foldText } from '../catalog/categories'

interface Suggestion {
  kind: 'famille' | 'produit'
  label: string
  sub?: string
  /** Valeur appliquée à la sélection (nom de famille, ou requête produit). */
  value: string
}

const MAX_FAMILIES = 3
const MAX_PRODUCTS = 7

export function SearchAutocomplete({ value, onChange, onPickFamily, products }: {
  value: string
  onChange: (q: string) => void
  onPickFamily: (famille: string) => void
  products: ProductRow[]
}) {
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)

  const suggestions = useMemo<Suggestion[]>(() => {
    const q = value.trim()
    if (q.length < 2) return []
    const folded = foldText(q)
    const fams = [...new Set(products.map((p) => (p.famille && p.famille.trim()) || 'Autres'))]
      .filter((f) => foldText(f).includes(folded))
      .sort((a, b) => a.localeCompare(b, 'fr'))
      .slice(0, MAX_FAMILIES)
      .map((f): Suggestion => ({ kind: 'famille', label: f, sub: 'famille', value: f }))
    const prods = products
      .filter((p) => matchesQuery(p, q))
      .slice(0, MAX_PRODUCTS)
      .map((p): Suggestion => ({
        kind: 'produit',
        label: p.name,
        sub: p.reference ?? p.ean ?? undefined,
        value: p.reference ?? p.name,
      }))
    return [...fams, ...prods]
  }, [products, value])

  const pick = (s: Suggestion) => {
    if (s.kind === 'famille') onPickFamily(s.label)
    else onChange(s.value)
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setHover((h) => (h + 1) % suggestions.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHover((h) => (h - 1 + suggestions.length) % suggestions.length) }
    else if (e.key === 'Enter' && suggestions[hover]) { e.preventDefault(); pick(suggestions[hover]) }
    else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div ref={boxRef} className="relative flex-1 min-w-[180px]">
      <div className="flex items-center gap-2">
        <Search className="w-4 h-4 text-white/40 shrink-0" />
        <input
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true); setHover(0) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)} // laisser passer le clic sur une suggestion
          onKeyDown={onKeyDown}
          placeholder="Rechercher — réf, EAN, nom, famille…"
          className="bg-transparent text-white/85 text-sm w-full focus:outline-none placeholder:text-white/30"
        />
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-2 z-40 bg-surface-2 border border-white/10 rounded-lg shadow-xl overflow-hidden">
          {suggestions.map((s, i) => (
            <button
              key={`${s.kind}:${s.label}:${i}`}
              onMouseDown={(e) => { e.preventDefault(); pick(s) }}
              onMouseEnter={() => setHover(i)}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs ${i === hover ? 'bg-indigo-500/20' : ''}`}
            >
              {s.kind === 'famille'
                ? <span className="shrink-0 text-[9px] uppercase tracking-wide text-amber-300/90 bg-amber-500/10 border border-amber-500/25 rounded px-1 py-px">Famille</span>
                : <Search className="w-3 h-3 text-white/30 shrink-0" />}
              <span className="truncate text-white/85">{s.label}</span>
              {s.sub && s.kind === 'produit' && <span className="text-white/35 shrink-0 tabular-nums">· {s.sub}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
