import { useState, useMemo } from 'react'
import type { Product } from '@/features/pim/types'
import { usePimStore } from '@/stores/pim.store'
import { useUpsertProducts, useDeleteProducts } from '@/features/pim/useProducts'

interface Props {
  product: Product
  onClose: () => void
}

export function DedupPopover({ product, onClose }: Props) {
  const projectId = usePimStore((s) => s.currentProjectId) ?? ''
  const products = usePimStore((s) => s.products)
  const upsertProducts = useUpsertProducts(projectId)
  const deleteProducts = useDeleteProducts(projectId)
  const [filter, setFilter] = useState('')

  const candidates = useMemo(() => {
    const q = filter.toLowerCase()
    return products.filter(
      (p) =>
        p._id !== product._id &&
        !p.needsDedup &&
        p.taxonomyPath.join('/') === product.taxonomyPath.join('/') &&
        (!q || JSON.stringify(p.fields).toLowerCase().includes(q)),
    ).slice(0, 20)
  }, [products, product, filter])

  const merge = async (target: Product) => {
    const newLinks = [...target.sourceLinks, ...product.sourceLinks]
    await upsertProducts.mutateAsync([{ ...target, sourceLinks: newLinks, updatedAt: Date.now() }])
    await deleteProducts.mutateAsync([product._id])
    onClose()
  }

  const ignore = async () => {
    await upsertProducts.mutateAsync([{ ...product, needsDedup: false, updatedAt: Date.now() }])
    onClose()
  }

  const productName = String(product.fields.name?.value ?? product._id)

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-md shadow-xl w-[440px] p-3">
        <p className="text-[12px] text-white/85 mb-2">
          Fusionner « {productName} » avec :
        </p>
        <input
          autoFocus
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Rechercher un produit cible…"
          className="w-full bg-white/[0.04] border border-white/[0.06] rounded-md px-2 py-1 text-[12px] text-white/70 placeholder:text-white/25 outline-none mb-2"
        />
        <ul className="max-h-[240px] overflow-y-auto space-y-0.5 text-[12px]">
          {candidates.map((c) => (
            <li key={c._id}>
              <button
                onClick={() => merge(c)}
                className="w-full text-left px-2 py-1 hover:bg-white/[0.06] rounded text-white/70 hover:text-white flex items-center justify-between gap-2"
              >
                <span className="truncate">{String(c.fields.name?.value ?? c._id)}</span>
                <span className="text-[10px] text-white/30 shrink-0">{c.masterSku ?? 'sans SKU'}</span>
              </button>
            </li>
          ))}
          {candidates.length === 0 && (
            <li className="text-[11px] text-white/40 px-2 py-1">Aucun candidat trouvé.</li>
          )}
        </ul>
        <div className="flex justify-between mt-3 pt-2 border-t border-white/10">
          <button onClick={ignore} className="text-[11px] text-white/50 hover:text-white/85">
            Ignorer (le garder autonome)
          </button>
          <button onClick={onClose} className="text-[11px] text-white/50 hover:text-white/85">
            Annuler
          </button>
        </div>
      </div>
    </div>
  )
}
