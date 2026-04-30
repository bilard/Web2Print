import { useState } from 'react'
import { ChevronRight, X, AlertTriangle } from 'lucide-react'
import { usePimStore } from '@/stores/pim.store'
import { DedupPopover } from './DedupPopover'
import type { Product } from '@/features/pim/types'

export function Breadcrumb() {
  const project = usePimStore((s) => {
    const id = s.currentProjectId
    return id ? s.projects.find((p) => p.id === id) : null
  })
  const selectedSourceIds = usePimStore((s) => s.selectedSourceIds)
  const setSelectedSourceIds = usePimStore((s) => s.setSelectedSourceIds)
  const taxoFilter = usePimStore((s) => s.taxonomyNavFilter)
  const setTaxoFilter = usePimStore((s) => s.setTaxonomyNavFilter)
  const products = usePimStore((s) => s.products)
  const [dedupOpen, setDedupOpen] = useState(false)
  const [dedupTarget, setDedupTarget] = useState<Product | null>(null)

  if (!project) return null

  const sources = selectedSourceIds
    .map((id) => project.sources.find((s) => s.id === id)?.name)
    .filter(Boolean) as string[]

  const sourcesLabel =
    sources.length === 0 ? null
    : sources.length === 1 ? sources[0]
    : `${sources.length} sources`

  const needsDedup = products.filter((p) => p.needsDedup)

  return (
    <div className="px-4 py-2 border-b border-white/[0.06] flex items-center gap-2 text-[12px] flex-wrap">
      <span className="text-white/85">{project.name}</span>
      {sourcesLabel && (
        <>
          <ChevronRight className="w-3 h-3 text-white/30" />
          <span className="text-white/60">{sourcesLabel}</span>
          <button
            onClick={() => setSelectedSourceIds([])}
            className="text-white/30 hover:text-white/70"
            title="Retirer le filtre source"
          >
            <X className="w-3 h-3" />
          </button>
        </>
      )}
      {taxoFilter.map((seg, i) => (
        <span key={i} className="flex items-center gap-1">
          <ChevronRight className="w-3 h-3 text-white/30" />
          <span className="text-white/60">{seg}</span>
          {i === taxoFilter.length - 1 && (
            <button
              onClick={() => setTaxoFilter(taxoFilter.slice(0, -1))}
              className="text-white/30 hover:text-white/70"
              title="Remonter d'un niveau"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </span>
      ))}

      {needsDedup.length > 0 && (
        <button
          onClick={() => setDedupOpen(!dedupOpen)}
          className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 rounded text-[11px] text-amber-300"
        >
          <AlertTriangle className="w-3 h-3" />
          {needsDedup.length} à dédupliquer
        </button>
      )}

      {dedupOpen && needsDedup.length > 0 && (
        <div className="absolute right-4 top-12 z-40 bg-[#1a1a1a] border border-white/10 rounded-md shadow-xl w-[300px] max-h-[400px] overflow-y-auto py-1">
          <p className="px-3 py-1.5 text-[10px] uppercase text-white/30 border-b border-white/5">
            Produits sans SKU détecté
          </p>
          {needsDedup.map((p) => (
            <button
              key={p._id}
              onClick={() => { setDedupTarget(p); setDedupOpen(false) }}
              className="w-full text-left px-3 py-1.5 text-[12px] text-white/70 hover:bg-white/[0.06] hover:text-white"
            >
              {String(p.fields.name?.value ?? p._id)}
            </button>
          ))}
        </div>
      )}

      {dedupTarget && (
        <DedupPopover product={dedupTarget} onClose={() => setDedupTarget(null)} />
      )}
    </div>
  )
}
