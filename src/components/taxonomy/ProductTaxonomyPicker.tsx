import { useEffect, useMemo, useState } from 'react'
import { X, Search, Layers, Check } from 'lucide-react'
import { useTaxonomies } from '@/features/taxonomy/useTaxonomies'
import { findPath } from '@/features/taxonomy/taxonomyUtils'
import type { Taxonomy, TaxonomyNode } from '@/features/taxonomy/types'

interface ProductTaxonomyPickerProps {
  open: boolean
  currentTaxonomyId: string | null
  currentNodeId: string | null
  onClose: () => void
  onPick: (taxonomyId: string, nodeId: string) => void
  onClear: () => void
}

interface NodeEntry {
  taxonomy: Taxonomy
  node: TaxonomyNode
  pathLabels: string[]
  pathString: string
}

export function ProductTaxonomyPicker({
  open,
  currentTaxonomyId,
  currentNodeId,
  onClose,
  onPick,
  onClear,
}: ProductTaxonomyPickerProps) {
  const { data: taxonomies } = useTaxonomies()
  const [search, setSearch] = useState('')
  const [taxonomyFilter, setTaxonomyFilter] = useState<string | 'all'>('all')

  useEffect(() => {
    if (open) {
      setSearch('')
      setTaxonomyFilter(currentTaxonomyId ?? 'all')
    }
  }, [open, currentTaxonomyId])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Toutes les entrées (tous les nœuds, pas seulement les feuilles)
  const allEntries = useMemo<NodeEntry[]>(() => {
    if (!taxonomies) return []
    const entries: NodeEntry[] = []
    for (const tax of taxonomies) {
      for (const node of Object.values(tax.nodes)) {
        const pathIds = findPath(tax.nodes, node.id)
        const labels = pathIds.map((id) => tax.nodes[id]?.label ?? '')
        entries.push({
          taxonomy: tax,
          node,
          pathLabels: labels,
          pathString: labels.join(' › '),
        })
      }
    }
    return entries
  }, [taxonomies])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allEntries
      .filter((e) => (taxonomyFilter === 'all' ? true : e.taxonomy.id === taxonomyFilter))
      .filter((e) => (q.length === 0 ? true : e.pathString.toLowerCase().includes(q)))
      .sort((a, b) => a.pathString.localeCompare(b.pathString))
  }, [allEntries, taxonomyFilter, search])

  if (!open) return null

  const isCurrent = (taxonomyId: string, nodeId: string) =>
    currentTaxonomyId === taxonomyId && currentNodeId === nodeId

  const handlePick = (entry: NodeEntry) => {
    onPick(entry.taxonomy.id, entry.node.id)
    onClose()
  }

  const handleClear = () => {
    onClear()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-taxo-picker-title"
        onClick={(e) => e.stopPropagation()}
        className="bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl w-[560px] max-h-[82vh] flex flex-col"
      >
        <div className="flex items-start justify-between px-5 py-4 border-b border-white/[0.06]">
          <div className="min-w-0">
            <h2 id="product-taxo-picker-title" className="text-[14px] font-semibold text-white/90 flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              Classer ce produit dans une taxonomie
            </h2>
            <p className="text-[11px] text-white/35 mt-0.5">
              Sélectionnez le nœud où classer ce produit
            </p>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/70 transition-colors shrink-0" aria-label="Fermer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 pt-3">
          <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] focus-within:border-indigo-500/40 rounded-lg px-3 py-2 transition-colors">
            <Search className="w-3.5 h-3.5 text-white/25 shrink-0" />
            <input
              type="text"
              placeholder="Rechercher un nœud (Électronique › Audio › …)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              className="flex-1 bg-transparent text-[12px] text-white/80 placeholder:text-white/25 outline-none"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-white/30 hover:text-white/70" aria-label="Effacer">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {taxonomies && taxonomies.length > 1 && (
          <div className="px-4 pt-3 pb-1 flex items-center gap-1 flex-wrap">
            <button
              onClick={() => setTaxonomyFilter('all')}
              className={`text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors ${
                taxonomyFilter === 'all' ? 'bg-indigo-500/15 text-indigo-300' : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
              }`}
            >
              Toutes
            </button>
            {taxonomies.map((t) => {
              const active = taxonomyFilter === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setTaxonomyFilter(t.id)}
                  className={`text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors truncate max-w-[180px] ${
                    active ? 'bg-indigo-500/15 text-indigo-300' : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
                  }`}
                  title={t.name}
                >
                  {t.name}
                </button>
              )
            })}
          </div>
        )}

        <div className="px-5 py-2 mt-2 border-y border-white/[0.06]">
          <span className="text-[11px] text-white/40">
            {visible.length} nœud{visible.length !== 1 ? 's' : ''} disponible{visible.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2 min-h-[220px]">
          {visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Layers className="w-8 h-8 text-white/10 mb-2" />
              <p className="text-[12px] text-white/35">
                {search ? 'Aucun nœud trouvé' : 'Aucune taxonomie disponible'}
              </p>
            </div>
          ) : (
            <ul className="space-y-0.5">
              {visible.map((entry) => {
                const current = isCurrent(entry.taxonomy.id, entry.node.id)
                return (
                  <li key={`${entry.taxonomy.id}:${entry.node.id}`}>
                    <button
                      type="button"
                      onClick={() => handlePick(entry)}
                      className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-left group ${
                        current ? 'bg-indigo-500/[0.12] hover:bg-indigo-500/[0.18]' : 'hover:bg-white/[0.04]'
                      }`}
                    >
                      <span
                        className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                          current ? 'bg-indigo-500 border-indigo-500' : 'border-white/20 group-hover:border-white/40'
                        }`}
                      >
                        {current && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] uppercase tracking-wide text-white/30 truncate">
                          {entry.taxonomy.name}
                        </p>
                        <p className="text-[12px] text-white/80 truncate">
                          {entry.pathLabels.map((label, i) => (
                            <span key={i}>
                              {i > 0 && <span className="text-white/25 mx-1">›</span>}
                              <span className={i === entry.pathLabels.length - 1 ? 'text-white font-medium' : ''}>
                                {label}
                              </span>
                            </span>
                          ))}
                        </p>
                      </div>
                      {current && (
                        <span className="text-[10px] text-indigo-300 font-medium px-1.5 py-0.5 rounded bg-indigo-500/15 shrink-0">
                          Classé
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="px-5 py-3 border-t border-white/[0.06] flex justify-between items-center gap-3">
          <span className="text-[11px] text-white/40">
            {currentTaxonomyId && currentNodeId ? 'Re-cliquer sur le nœud courant le resynchronise' : 'Produit non classé actuellement'}
          </span>
          <div className="flex items-center gap-2">
            {currentTaxonomyId && currentNodeId && (
              <button
                onClick={handleClear}
                className="text-[12px] font-medium text-red-300 hover:text-red-200 bg-red-500/[0.08] hover:bg-red-500/[0.15] border border-red-500/20 px-3 py-2 rounded-lg transition-colors"
              >
                Désassigner
              </button>
            )}
            <button
              onClick={onClose}
              className="text-[12px] font-medium text-white/70 hover:text-white bg-white/[0.06] hover:bg-white/10 px-4 py-2 rounded-lg transition-colors"
            >
              Fermer
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
