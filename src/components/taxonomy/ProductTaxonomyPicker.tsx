import { useEffect, useMemo, useState } from 'react'
import {
  X, Search, Layers, Sparkles, Loader2, Package,
  ChevronsUpDown, ChevronsDownUp, Filter,
} from 'lucide-react'
import { toast } from 'sonner'
import { useTaxonomies } from '@/features/taxonomy/useTaxonomies'
import { findPath } from '@/features/taxonomy/taxonomyUtils'
import {
  classifyProductInTaxonomy,
  type ProductClassificationInput,
} from '@/features/taxonomy/aiClassifyProduct'
import {
  useAllTaxonomyProductCounts,
  type TaxonomyProductCounts,
} from '@/features/taxonomy/useTaxonomyProductCounts'
import { ProductTaxonomyPickerTree } from './ProductTaxonomyPickerTree'
import type { Taxonomy } from '@/features/taxonomy/types'

interface ProductTaxonomyPickerProps {
  open: boolean
  currentTaxonomyId: string | null
  currentNodeId: string | null
  /** Données produit utilisées par la classification IA (titre, breadcrumb source, etc.). */
  productInfo?: ProductClassificationInput
  onClose: () => void
  onPick: (taxonomyId: string, nodeId: string) => void
  onClear: () => void
}

interface AiSuggestion {
  taxonomyId: string
  nodeId: string
  confidence: number
  reasoning: string
  pathString: string
}

/** Sous-composant : un arbre par taxonomie. `counts` est calculé au top-level
 *  via useAllTaxonomyProductCounts puis passé en prop pour éviter N appels. */
function TaxonomyTreeSection({
  taxonomy,
  counts,
  currentTaxonomyId,
  currentNodeId,
  suggestion,
  search,
  onPick,
  showHeader,
  expandedNodeIds,
  onToggleNode,
  withProductsOnly,
}: {
  taxonomy: Taxonomy
  counts: TaxonomyProductCounts
  currentTaxonomyId: string | null
  currentNodeId: string | null
  suggestion: AiSuggestion | null
  search: string
  onPick: (taxonomyId: string, nodeId: string) => void
  showHeader: boolean
  expandedNodeIds: Set<string>
  onToggleNode: (nodeId: string) => void
  withProductsOnly: boolean
}) {
  const isCurrentTax = currentTaxonomyId === taxonomy.id
  const isSuggestedTax = suggestion?.taxonomyId === taxonomy.id
  const totalNodes = Object.keys(taxonomy.nodes).length

  return (
    <div className="mb-2">
      {showHeader && (
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06] -mx-2">
          <span className="text-[10px] uppercase tracking-wider text-white/35 font-medium">
            {taxonomy.name}
          </span>
          <span className="inline-flex items-center gap-3 text-[10px] text-white/30">
            <span>{totalNodes} nœuds</span>
            {counts.grandTotal > 0 && (
              <span className="inline-flex items-center gap-1 text-white/45">
                <Package className="w-2.5 h-2.5" />
                {counts.grandTotal} classé{counts.grandTotal !== 1 ? 's' : ''}
              </span>
            )}
          </span>
        </div>
      )}
      <ProductTaxonomyPickerTree
        taxonomy={taxonomy}
        currentNodeId={isCurrentTax ? currentNodeId : null}
        suggestedNodeId={isSuggestedTax ? suggestion!.nodeId : null}
        search={search}
        counts={counts}
        expandedNodeIds={expandedNodeIds}
        onToggleNode={onToggleNode}
        withProductsOnly={withProductsOnly}
        onPick={(nodeId) => onPick(taxonomy.id, nodeId)}
      />
    </div>
  )
}

/** Bandeau fixe au-dessus de la zone scrollable (cas une seule taxonomie en scope). */
function FixedTaxonomyHeader({
  taxonomy,
  counts,
}: {
  taxonomy: Taxonomy
  counts: TaxonomyProductCounts
}) {
  const totalNodes = Object.keys(taxonomy.nodes).length
  return (
    <div className="flex items-center justify-between px-5 py-2 bg-[#161618] border-y border-white/[0.06] shrink-0">
      <span className="text-[10px] uppercase tracking-wider text-white/35 font-medium">
        {taxonomy.name}
      </span>
      <span className="inline-flex items-center gap-3 text-[10px] text-white/30">
        <span>{totalNodes} nœuds</span>
        {counts.grandTotal > 0 && (
          <span className="inline-flex items-center gap-1 text-white/45">
            <Package className="w-2.5 h-2.5" />
            {counts.grandTotal} classé{counts.grandTotal !== 1 ? 's' : ''}
          </span>
        )}
      </span>
    </div>
  )
}

const EMPTY_COUNTS: TaxonomyProductCounts = { direct: {}, total: {}, grandTotal: 0 }

export function ProductTaxonomyPicker({
  open,
  currentTaxonomyId,
  currentNodeId,
  productInfo,
  onClose,
  onPick,
  onClear,
}: ProductTaxonomyPickerProps) {
  const { data: taxonomies } = useTaxonomies()
  const [search, setSearch] = useState('')
  const [taxonomyFilter, setTaxonomyFilter] = useState<string | 'all'>('all')
  const [aiLoading, setAiLoading] = useState(false)
  const [suggestion, setSuggestion] = useState<AiSuggestion | null>(null)
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(new Set())
  const [withProductsOnly, setWithProductsOnly] = useState(false)

  useEffect(() => {
    if (open) {
      setSearch('')
      setTaxonomyFilter(currentTaxonomyId ?? 'all')
      setSuggestion(null)
      setWithProductsOnly(false)
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

  const visibleTaxonomies: Taxonomy[] = useMemo(() => {
    if (!taxonomies) return []
    if (taxonomyFilter === 'all') return taxonomies
    return taxonomies.filter((t) => t.id === taxonomyFilter)
  }, [taxonomies, taxonomyFilter])

  const allCounts = useAllTaxonomyProductCounts(visibleTaxonomies)

  // Init/reset de l'expand : à l'ouverture, sur changement de scope, ou quand
  // une suggestion IA arrive — on ouvre les niveaux 0 + le chemin du courant
  // + le chemin de la suggestion.
  useEffect(() => {
    if (!open) return
    const next = new Set<string>()
    for (const tax of visibleTaxonomies) {
      for (const node of Object.values(tax.nodes)) {
        if (node.level === 0) next.add(node.id)
      }
      if (currentTaxonomyId === tax.id && currentNodeId && tax.nodes[currentNodeId]) {
        for (const id of findPath(tax.nodes, currentNodeId)) next.add(id)
      }
      if (suggestion?.taxonomyId === tax.id && tax.nodes[suggestion.nodeId]) {
        for (const id of findPath(tax.nodes, suggestion.nodeId)) next.add(id)
      }
    }
    setExpandedNodeIds(next)
  }, [open, visibleTaxonomies, currentTaxonomyId, currentNodeId, suggestion])

  // Auto-expand des branches qui matchent la recherche.
  useEffect(() => {
    if (!open || !search.trim()) return
    const q = search.toLowerCase()
    setExpandedNodeIds((prev) => {
      const next = new Set(prev)
      for (const tax of visibleTaxonomies) {
        for (const node of Object.values(tax.nodes)) {
          if (node.label.toLowerCase().includes(q)) {
            for (const id of findPath(tax.nodes, node.id)) next.add(id)
          }
        }
      }
      return next
    })
  }, [search, open, visibleTaxonomies])

  if (!open) return null

  const handleToggleNode = (nodeId: string) => {
    setExpandedNodeIds((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }

  const handleExpandAll = () => {
    const next = new Set<string>()
    for (const tax of visibleTaxonomies) {
      for (const node of Object.values(tax.nodes)) {
        // On marque tous les nœuds qui ont au moins un enfant (les non-feuilles)
        const hasChild = Object.values(tax.nodes).some((n) => n.parentId === node.id)
        if (hasChild) next.add(node.id)
      }
    }
    setExpandedNodeIds(next)
  }

  const handleCollapseAll = () => {
    setExpandedNodeIds(new Set())
  }

  const handleNodePick = (taxonomyId: string, nodeId: string) => {
    onPick(taxonomyId, nodeId)
    onClose()
  }

  const handleClear = () => {
    onClear()
    onClose()
  }

  const targetTaxonomy: Taxonomy | null = (() => {
    if (!taxonomies || taxonomies.length === 0) return null
    if (taxonomyFilter !== 'all') return taxonomies.find((t) => t.id === taxonomyFilter) ?? null
    if (taxonomies.length === 1) return taxonomies[0]
    return null
  })()

  const hasProductSignal = !!(
    productInfo &&
    (productInfo.title ||
      productInfo.description ||
      (productInfo.sourceBreadcrumb && productInfo.sourceBreadcrumb.length > 0) ||
      productInfo.sourceCategoryPath)
  )

  const handleAiClassify = async () => {
    if (!targetTaxonomy || !productInfo || aiLoading) return
    setAiLoading(true)
    setSuggestion(null)
    try {
      const result = await classifyProductInTaxonomy(targetTaxonomy, productInfo)
      if (!result.nodeId || !targetTaxonomy.nodes[result.nodeId]) {
        toast.info(result.reasoning || "L'IA n'a trouvé aucun chemin pertinent.")
        return
      }
      const pathIds = findPath(targetTaxonomy.nodes, result.nodeId)
      const pathString = pathIds
        .map((id) => targetTaxonomy.nodes[id]?.label ?? '')
        .filter(Boolean)
        .join(' › ')
      const next: AiSuggestion = {
        taxonomyId: targetTaxonomy.id,
        nodeId: result.nodeId,
        confidence: result.confidence,
        reasoning: result.reasoning,
        pathString,
      }
      setSuggestion(next)
      // Scroller vers le nœud suggéré dans l'arbre (laisse 1 frame pour que
      // l'arbre s'auto-expand sur le chemin via son useEffect).
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = document.querySelector<HTMLElement>(
            `[data-node-id="${next.taxonomyId}:${next.nodeId}"]`,
          )
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        })
      })
    } catch (err) {
      toast.error(
        `Classification IA impossible : ${err instanceof Error ? err.message.slice(0, 120) : String(err)}`,
      )
    } finally {
      setAiLoading(false)
    }
  }

  const handleApplySuggestion = () => {
    if (!suggestion) return
    onPick(suggestion.taxonomyId, suggestion.nodeId)
    onClose()
  }

  const aiTooltip = !hasProductSignal
    ? 'Aucune info produit exploitable (titre, description, fil d’Ariane…)'
    : !targetTaxonomy
    ? 'Sélectionne d’abord une taxonomie cible'
    : `Classer ce produit automatiquement dans « ${targetTaxonomy.name} »`

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
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleAiClassify}
              disabled={aiLoading || !targetTaxonomy || !hasProductSignal}
              title={aiTooltip}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-md bg-indigo-500/[0.12] hover:bg-indigo-500/[0.22] disabled:opacity-40 disabled:cursor-not-allowed border border-indigo-500/30 text-indigo-200 transition-colors"
              aria-label="Classer automatiquement via IA"
            >
              {aiLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>{aiLoading ? 'Analyse…' : 'Classer auto'}</span>
            </button>
            <button onClick={onClose} className="text-white/30 hover:text-white/70 transition-colors" aria-label="Fermer">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {suggestion && (
          <div className="mx-4 mt-3 p-3 rounded-lg bg-indigo-500/[0.08] border border-indigo-500/30">
            <div className="flex items-start gap-2">
              <Sparkles className="w-3.5 h-3.5 text-indigo-300 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] uppercase tracking-wider text-indigo-200/70 font-medium">
                    Suggestion IA
                  </span>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                      suggestion.confidence >= 0.85
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25'
                        : suggestion.confidence >= 0.5
                        ? 'bg-amber-500/15 text-amber-300 border border-amber-500/25'
                        : 'bg-red-500/15 text-red-300 border border-red-500/25'
                    }`}
                  >
                    {Math.round(suggestion.confidence * 100)}%
                  </span>
                </div>
                <p className="text-[12px] text-white/85 mt-1 break-words">{suggestion.pathString}</p>
                {suggestion.reasoning && (
                  <p className="text-[11px] text-white/45 mt-1 italic break-words">{suggestion.reasoning}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={handleApplySuggestion}
                  className="text-[11px] font-medium text-white bg-indigo-500 hover:bg-indigo-600 px-2.5 py-1 rounded transition-colors"
                >
                  Appliquer
                </button>
                <button
                  onClick={() => setSuggestion(null)}
                  className="text-white/30 hover:text-white/70 transition-colors"
                  aria-label="Ignorer la suggestion"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

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

        {visibleTaxonomies.length === 1 && (
          <FixedTaxonomyHeader
            taxonomy={visibleTaxonomies[0]}
            counts={allCounts.get(visibleTaxonomies[0].id) ?? EMPTY_COUNTS}
          />
        )}

        {visibleTaxonomies.length > 0 && (
          <div className="flex items-center gap-1 px-3 py-1.5 border-b border-white/[0.06] shrink-0">
            <button
              onClick={handleExpandAll}
              className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md text-white/55 hover:text-white/85 hover:bg-white/[0.06] transition-colors"
              title="Développer tous les nœuds"
            >
              <ChevronsUpDown className="w-3 h-3" />
              Tout ouvrir
            </button>
            <button
              onClick={handleCollapseAll}
              className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md text-white/55 hover:text-white/85 hover:bg-white/[0.06] transition-colors"
              title="Réduire tous les nœuds"
            >
              <ChevronsDownUp className="w-3 h-3" />
              Tout fermer
            </button>
            <button
              onClick={() => setWithProductsOnly((v) => !v)}
              className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md transition-colors ml-auto ${
                withProductsOnly
                  ? 'bg-indigo-500/15 text-indigo-200 ring-1 ring-indigo-500/30'
                  : 'text-white/55 hover:text-white/85 hover:bg-white/[0.06]'
              }`}
              aria-pressed={withProductsOnly}
              title="Afficher uniquement les nœuds qui contiennent au moins un produit"
            >
              <Filter className="w-3 h-3" />
              Avec produits
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-2 py-2 min-h-[220px]">
          {visibleTaxonomies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Layers className="w-8 h-8 text-white/10 mb-2" />
              <p className="text-[12px] text-white/35">Aucune taxonomie disponible</p>
            </div>
          ) : (
            visibleTaxonomies.map((tax) => (
              <TaxonomyTreeSection
                key={tax.id}
                taxonomy={tax}
                counts={allCounts.get(tax.id) ?? EMPTY_COUNTS}
                currentTaxonomyId={currentTaxonomyId}
                currentNodeId={currentNodeId}
                suggestion={suggestion}
                search={search}
                onPick={handleNodePick}
                showHeader={visibleTaxonomies.length > 1}
                expandedNodeIds={expandedNodeIds}
                onToggleNode={handleToggleNode}
                withProductsOnly={withProductsOnly}
              />
            ))
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
