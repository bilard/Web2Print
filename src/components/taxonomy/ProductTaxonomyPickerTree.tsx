import { useMemo } from 'react'
import { ChevronRight, ChevronDown, Check, Sparkles, Package } from 'lucide-react'
import { buildTree, nodeMatchesSearch } from '@/features/taxonomy/taxonomyUtils'
import type { Taxonomy, TaxonomyNodeWithChildren } from '@/features/taxonomy/types'
import type { TaxonomyProductCounts } from '@/features/taxonomy/useTaxonomyProductCounts'

interface ProductTaxonomyPickerTreeProps {
  taxonomy: Taxonomy
  /** ID du nœud actuellement sélectionné (peut appartenir à une autre taxonomie, alors null). */
  currentNodeId: string | null
  /** ID du nœud suggéré par l'IA (peut appartenir à une autre taxonomie, alors null). */
  suggestedNodeId: string | null
  /** Recherche live (filtre branches qui contiennent un match). */
  search: string
  counts: TaxonomyProductCounts
  /** IDs des nœuds expansés (controlled depuis le parent). */
  expandedNodeIds: Set<string>
  /** Toggle l'expand d'un nœud. */
  onToggleNode: (nodeId: string) => void
  /** N'afficher que les branches qui contiennent au moins un produit classé. */
  withProductsOnly: boolean
  /** Callback de sélection. */
  onPick: (nodeId: string) => void
}

const LEVEL_FONT = [
  'text-[13px] font-semibold',
  'text-[12px] font-medium',
  'text-[12px] font-normal',
  'text-[11px] font-normal',
  'text-[11px] font-normal',
]
const LEVEL_TEXT = [
  'text-white',
  'text-indigo-100',
  'text-indigo-200/90',
  'text-indigo-300/80',
  'text-indigo-300/65',
]

function highlight(label: string, query: string) {
  if (!query) return label
  const idx = label.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return label
  return (
    <>
      {label.slice(0, idx)}
      <mark className="bg-yellow-400/30 text-yellow-200 rounded-sm px-0.5">
        {label.slice(idx, idx + query.length)}
      </mark>
      {label.slice(idx + query.length)}
    </>
  )
}

export function ProductTaxonomyPickerTree({
  taxonomy,
  currentNodeId,
  suggestedNodeId,
  search,
  counts,
  expandedNodeIds,
  onToggleNode,
  withProductsOnly,
  onPick,
}: ProductTaxonomyPickerTreeProps) {
  const tree = useMemo(() => buildTree(taxonomy.nodes), [taxonomy])

  const hasProductInBranch = (n: TaxonomyNodeWithChildren): boolean =>
    (counts.total[n.id] ?? 0) > 0

  const filteredTree = useMemo(() => {
    let result = tree
    if (search.trim()) {
      result = result.filter((n) => nodeMatchesSearch(n, search))
    }
    if (withProductsOnly) {
      result = result.filter(hasProductInBranch)
    }
    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, search, withProductsOnly, counts])

  const renderNode = (node: TaxonomyNodeWithChildren) => {
    const lvl = Math.min(node.level, LEVEL_FONT.length - 1)
    const isExpanded = expandedNodeIds.has(node.id)
    const isCurrent = currentNodeId === node.id
    const isSuggested = suggestedNodeId === node.id
    const directCount = counts.direct[node.id] ?? 0
    const totalCount = counts.total[node.id] ?? 0

    let visibleChildren = node.children
    if (search.trim()) {
      visibleChildren = visibleChildren.filter((c) => nodeMatchesSearch(c, search))
    }
    if (withProductsOnly) {
      visibleChildren = visibleChildren.filter(hasProductInBranch)
    }

    const showCount = node.isLeaf ? directCount > 0 : totalCount > 0

    return (
      <div key={node.id} data-node-id={`${taxonomy.id}:${node.id}`}>
        <div
          className={`group flex items-center gap-1.5 px-1.5 py-1 rounded-md transition-colors ${
            isCurrent
              ? 'bg-indigo-500/[0.18] hover:bg-indigo-500/[0.24]'
              : isSuggested
              ? 'bg-indigo-500/[0.06] hover:bg-indigo-500/[0.12] ring-1 ring-indigo-400/40'
              : 'hover:bg-white/[0.04]'
          }`}
          style={{ paddingLeft: `${node.level * 14 + 6}px` }}
        >
          <button
            onClick={() => !node.isLeaf && onToggleNode(node.id)}
            className={`flex-shrink-0 w-4 h-4 flex items-center justify-center ${
              node.isLeaf ? 'cursor-default' : 'text-white/35 hover:text-white/70'
            }`}
            aria-label={isExpanded ? `Réduire ${node.label}` : `Développer ${node.label}`}
          >
            {!node.isLeaf ? (
              isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />
            ) : (
              <span className="w-1 h-1 rounded-full bg-white/20" />
            )}
          </button>
          <button
            type="button"
            onClick={() => onPick(node.id)}
            className="flex-1 flex items-center gap-2 min-w-0 text-left"
          >
            <span
              className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                isCurrent
                  ? 'bg-indigo-500 border-indigo-500'
                  : isSuggested
                  ? 'border-indigo-400'
                  : 'border-white/20 group-hover:border-white/40'
              }`}
            >
              {isCurrent && <Check className="w-2 h-2 text-white" strokeWidth={3} />}
              {!isCurrent && isSuggested && <Sparkles className="w-2 h-2 text-indigo-300" />}
            </span>
            <span className={`flex-1 truncate ${LEVEL_FONT[lvl]} ${isCurrent ? 'text-white' : LEVEL_TEXT[lvl]}`}>
              {highlight(node.label, search)}
            </span>
            {showCount && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.08] text-white/50 shrink-0"
                title={
                  node.isLeaf
                    ? `${directCount} produit${directCount !== 1 ? 's' : ''} classé${directCount !== 1 ? 's' : ''} ici`
                    : `${totalCount} produit${totalCount !== 1 ? 's' : ''} dans cette branche${
                        directCount > 0 ? ` (dont ${directCount} directement)` : ''
                      }`
                }
              >
                <Package className="w-2.5 h-2.5 opacity-60" />
                {node.isLeaf ? directCount : totalCount}
              </span>
            )}
          </button>
        </div>
        {!node.isLeaf && isExpanded && visibleChildren.length > 0 && (
          <div>{visibleChildren.map(renderNode)}</div>
        )}
      </div>
    )
  }

  if (filteredTree.length === 0) {
    return null
  }

  return <div className="py-1">{filteredTree.map(renderNode)}</div>
}
