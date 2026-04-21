import { Trash2, Plus, ExternalLink } from 'lucide-react'
import type { CartItem } from '@/features/briefs/types'
import { formatPrice } from '@/features/briefs/cart/formatPrice'

interface Props {
  items: CartItem[]
  onChange: (items: CartItem[]) => void
}

export function CartTable({ items, onChange }: Props) {
  const updateItem = (idx: number, patch: Partial<CartItem>) => {
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }
  const removeItem = (idx: number) => onChange(items.filter((_, i) => i !== idx))
  const addManual = () =>
    onChange([
      ...items,
      {
        sku: 'CUSTOM',
        name: 'Produit manuel',
        categoryNodeId: '',
        quantity: 1,
        unitPrice: 0,
        source: 'manual',
      },
    ])

  return (
    <div className="border border-white/[0.06] rounded-md overflow-hidden">
      <table className="w-full text-[12px] table-fixed">
        <colgroup>
          <col className="w-[180px]" />
          <col />
          <col className="w-14" />
          <col className="w-24" />
          <col className="w-24" />
          <col className="w-8" />
        </colgroup>
        <thead className="bg-[#161616] text-white/40 uppercase text-[10px] tracking-wide">
          <tr>
            <th className="text-left px-3 py-2">SKU</th>
            <th className="text-left px-3 py-2">Nom</th>
            <th className="text-right px-3 py-2">Qté</th>
            <th className="text-right px-3 py-2">Prix</th>
            <th className="text-right px-3 py-2">Total</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((it, idx) => {
            const price = it.unitPriceOverride ?? it.unitPrice ?? 0
            const total = price * it.quantity
            return (
              <tr key={`${it.sku}-${idx}`} className="border-t border-white/[0.06]">
                <td className="px-3 py-2 text-white/60 font-mono text-[11px] truncate" title={it.sku}>
                  <input
                    type="text"
                    value={it.sku}
                    onChange={(e) => updateItem(idx, { sku: e.target.value })}
                    className="bg-transparent w-full focus:outline-none truncate"
                    title={it.sku}
                  />
                </td>
                <td className="px-3 py-2 text-white/80">
                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="text"
                      value={it.name}
                      onChange={(e) => updateItem(idx, { name: e.target.value })}
                      className="bg-transparent flex-1 min-w-0 focus:outline-none"
                      title={it.name}
                    />
                    {it.sourceUrl && (
                      <a
                        href={it.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-white/30 hover:text-indigo-300 shrink-0"
                        title="Voir sur le site source"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    min={1}
                    value={it.quantity}
                    onChange={(e) => updateItem(idx, { quantity: Math.max(1, Number(e.target.value)) })}
                    className="bg-transparent w-full text-right focus:outline-none"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={price}
                    onChange={(e) => updateItem(idx, { unitPriceOverride: Number(e.target.value) })}
                    className="bg-transparent w-full text-right focus:outline-none"
                  />
                </td>
                <td className="px-3 py-2 text-right text-white/80 whitespace-nowrap">{formatPrice(total)}</td>
                <td className="px-2 py-2 text-right">
                  <button
                    onClick={() => removeItem(idx)}
                    className="text-white/30 hover:text-red-400"
                    aria-label="Supprimer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            )
          })}
          {items.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-8 text-center text-white/30">
                Aucun item dans le panier
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="border-t border-white/[0.06] bg-[#141414] px-3 py-2">
        <button
          onClick={addManual}
          className="flex items-center gap-1.5 text-[11px] text-white/60 hover:text-white"
        >
          <Plus className="w-3 h-3" />
          Ajouter un item manuel
        </button>
      </div>
    </div>
  )
}
