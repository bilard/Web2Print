import { useState } from 'react'
import { Eye, EyeOff, Type, Square, ImageIcon, Circle, Search } from 'lucide-react'
import { useRetailPromoStore } from './retailPromo.store'
import type { PromoBlockId } from './RetailPromoCard'

// Ordre d'affichage (haut → bas de la carte). icon : type d'élément.
const LAYERS: Array<{ id: PromoBlockId; label: string; isText: boolean; icon: 'block' | 'text' | 'image' | 'badge' }> = [
  { id: 'header', label: 'Bandeau en-tête', isText: false, icon: 'block' },
  { id: 'category', label: 'Catégorie', isText: true, icon: 'text' },
  { id: 'name', label: 'Nom', isText: true, icon: 'text' },
  { id: 'brand', label: 'Marque', isText: true, icon: 'text' },
  { id: 'description', label: 'Description', isText: true, icon: 'text' },
  { id: 'image', label: 'Cadre photo', isText: false, icon: 'image' },
  { id: 'badge', label: 'Badge remise', isText: false, icon: 'badge' },
  { id: 'price', label: 'Bandeau prix', isText: false, icon: 'block' },
  { id: 'priceLabel', label: 'Libellé prix', isText: true, icon: 'text' },
  { id: 'priceWas', label: 'Prix barré', isText: true, icon: 'text' },
  { id: 'unitPrice', label: 'Prix unitaire', isText: true, icon: 'text' },
  { id: 'priceNow', label: 'Prix promo', isText: true, icon: 'text' },
  { id: 'footer', label: 'Pied de page', isText: true, icon: 'text' },
]
const Icon = ({ k }: { k: 'block' | 'text' | 'image' | 'badge' }) =>
  k === 'text' ? <Type className="h-3.5 w-3.5" /> : k === 'image' ? <ImageIcon className="h-3.5 w-3.5" /> : k === 'badge' ? <Circle className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />

/** Panneau Calques : liste des éléments de la carte (sélection, visibilité). */
export function PromoLayersPanel() {
  const { config, selectedKey, setSelectedKey, setHidden } = useRetailPromoStore()
  const [q, setQ] = useState('')
  const rows = LAYERS.filter((l) => l.label.toLowerCase().includes(q.toLowerCase()))

  return (
    <aside className="flex min-h-0 w-56 flex-1 flex-col rounded-xl border border-white/10 bg-surface">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-white">Calques</h3>
        <span className="text-xs text-white/40">{LAYERS.length}</span>
      </div>
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 rounded border border-white/10 bg-well px-2 py-1">
          <Search className="h-3.5 w-3.5 text-white/30" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/25" />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {rows.map((l) => {
          const hidden = !!config.hidden?.[l.id]
          const active = selectedKey === l.id
          return (
            <div key={l.id} onClick={() => setSelectedKey(l.id)}
              className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm ${active ? 'bg-[#6366f1]/20 text-white' : 'text-white/70 hover:bg-white/5'}`}>
              <span className="text-white/40"><Icon k={l.icon} /></span>
              <span className="flex-1 truncate">{l.label}</span>
              {l.isText && <span className="text-[10px] font-bold text-[#818cf8]">Aa</span>}
              <button onClick={(e) => { e.stopPropagation(); setHidden(l.id, !hidden) }} className="text-white/40 hover:text-white" title={hidden ? 'Afficher' : 'Masquer'}>
                {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          )
        })}
      </div>
    </aside>
  )
}
