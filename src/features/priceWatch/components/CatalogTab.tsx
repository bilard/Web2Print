// src/features/priceWatch/components/CatalogTab.tsx
import { useState } from 'react'
import { useTrackedProducts, usePriceWatchMutations } from '../usePriceWatch'
import type { TrackedProduct } from '../types'

const inputCls = 'bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500/50'
const btnPrimaryCls = 'text-sm bg-indigo-500 hover:bg-indigo-600 text-[#fff] px-3 py-1.5 rounded-lg transition-colors'
const btnGhostCls = 'text-xs text-white/40 hover:text-red-400 px-2 py-1 rounded transition-colors'

export function CatalogTab() {
  const products = useTrackedProducts()
  const { saveProduct, deleteProduct } = usePriceWatchMutations()
  const [draft, setDraft] = useState<Partial<TrackedProduct>>({})

  const add = async () => {
    if (!draft.name?.trim()) return
    await saveProduct({
      id: crypto.randomUUID(),
      name: draft.name.trim(),
      sku: draft.sku,
      ean: draft.ean,
      brand: draft.brand,
      myPrice: draft.myPrice,
    })
    setDraft({})
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input
          className={`${inputCls} w-40`}
          placeholder="Nom *"
          value={draft.name ?? ''}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
        <input
          className={`${inputCls} w-32`}
          placeholder="Marque"
          value={draft.brand ?? ''}
          onChange={(e) => setDraft({ ...draft, brand: e.target.value })}
        />
        <input
          className={`${inputCls} w-28`}
          placeholder="SKU"
          value={draft.sku ?? ''}
          onChange={(e) => setDraft({ ...draft, sku: e.target.value })}
        />
        <input
          className={`${inputCls} w-32`}
          placeholder="EAN"
          value={draft.ean ?? ''}
          onChange={(e) => setDraft({ ...draft, ean: e.target.value })}
        />
        <input
          className={`${inputCls} w-28`}
          placeholder="Mon prix"
          type="number"
          value={draft.myPrice ?? ''}
          onChange={(e) => setDraft({ ...draft, myPrice: e.target.value ? Number(e.target.value) : undefined })}
        />
        <button type="button" className={btnPrimaryCls} onClick={add}>
          Ajouter
        </button>
      </div>
      <ul className="divide-y divide-white/10 rounded-md bg-surface">
        {products.map((p) => (
          <li key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
            <span className="text-white/80">
              {[p.brand, p.name].filter(Boolean).join(' ')}
              {p.sku && ` · ${p.sku}`}
              {p.myPrice != null && ` · ${p.myPrice} €`}
            </span>
            <button type="button" className={btnGhostCls} onClick={() => deleteProduct(p.id)}>
              Supprimer
            </button>
          </li>
        ))}
        {products.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-white/50">
            Aucun produit surveillé.
          </li>
        )}
      </ul>
    </div>
  )
}
