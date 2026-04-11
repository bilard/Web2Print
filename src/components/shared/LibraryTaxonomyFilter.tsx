import { useMemo, useState, useCallback, useEffect } from 'react'
import { ChevronRight, ChevronDown, FolderTree, X } from 'lucide-react'
import { useTaxonomies } from '@/features/taxonomy/useTaxonomies'
import { useProjects } from '@/features/projects/useProjects'
import { buildTree } from '@/features/taxonomy/taxonomyUtils'
import type { Taxonomy, TaxonomyNodeWithChildren } from '@/features/taxonomy/types'

interface LibraryTaxonomyFilterProps {
  selectedNodeId: string | null
  onSelectNode: (nodeId: string | null, projectIds: string[]) => void
}

/** Filtre les linkedProjectIds d'un nœud en ne gardant que les projets existants */
function effectiveLinkedIds(node: TaxonomyNodeWithChildren, existing: Set<string>): string[] {
  return node.linkedProjectIds.filter((id) => existing.has(id))
}

/** Collecte tous les linkedProjectIds (filtrés) d'un nœud et ses descendants */
function collectProjectIds(node: TaxonomyNodeWithChildren, existing: Set<string>): string[] {
  const ids = [...effectiveLinkedIds(node, existing)]
  for (const child of node.children) {
    ids.push(...collectProjectIds(child, existing))
  }
  return ids
}

/** Vérifie si un nœud ou un descendant a des projets liés (existants) */
function hasLinkedProjects(node: TaxonomyNodeWithChildren, existing: Set<string>): boolean {
  if (effectiveLinkedIds(node, existing).length > 0) return true
  return node.children.some((c) => hasLinkedProjects(c, existing))
}

/** Collecte les IDs des nœuds qui ont des projets (pour auto-expand) */
function collectExpandableIds(nodes: TaxonomyNodeWithChildren[], existing: Set<string>): Set<string> {
  const ids = new Set<string>()
  function walk(node: TaxonomyNodeWithChildren): boolean {
    const childHas = node.children.some((c) => walk(c))
    if (effectiveLinkedIds(node, existing).length > 0 || childHas) {
      ids.add(node.id)
      return true
    }
    return false
  }
  nodes.forEach(walk)
  return ids
}

// Style par niveau — même dégradé bleu que TaxonomyNode
const levelStyles = [
  { border: 'border-blue-900/50', text: 'text-blue-400', dot: 'bg-blue-800', size: 'text-[15px] font-bold', py: 'py-1.5' },
  { border: 'border-blue-700/40', text: 'text-blue-300', dot: 'bg-blue-600/80', size: 'text-[13px] font-semibold', py: 'py-1' },
  { border: 'border-blue-500/35', text: 'text-blue-200', dot: 'bg-blue-400/70', size: 'text-[12px] font-medium', py: 'py-[3px]' },
  { border: 'border-sky-400/30', text: 'text-sky-200', dot: 'bg-sky-400/60', size: 'text-[11px] font-normal', py: 'py-[3px]' },
  { border: 'border-sky-300/25', text: 'text-sky-100', dot: 'bg-sky-300/50', size: 'text-[11px] font-normal', py: 'py-[2px]' },
]

function FilterNode({
  node,
  taxonomy,
  selectedNodeId,
  expandedIds,
  onToggle,
  onSelect,
  existingProjectIds,
}: {
  node: TaxonomyNodeWithChildren
  taxonomy: Taxonomy
  selectedNodeId: string | null
  expandedIds: Set<string>
  onToggle: (id: string) => void
  onSelect: (nodeId: string, projectIds: string[]) => void
  existingProjectIds: Set<string>
}) {
  const hasProjects = hasLinkedProjects(node, existingProjectIds)
  if (!hasProjects) return null

  // Toujours développé : le panneau Filtrer est purement visuel/navigable, pas un arbre repliable
  const isExpanded = true
  const isSelected = selectedNodeId === node.id
  const projectCount = effectiveLinkedIds(node, existingProjectIds).length
  const childrenWithProjects = node.children.filter((c) => hasLinkedProjects(c, existingProjectIds))
  const hasExpandableChildren = childrenWithProjects.length > 0

  const lc = levelStyles[Math.min(node.level, levelStyles.length - 1)]

  return (
    <div className="relative">
      {/* Guides verticaux de hiérarchie */}
      {Array.from({ length: node.level }, (_, i) => {
        const guideColor = levelStyles[Math.min(i, levelStyles.length - 1)]
        return (
          <div key={i}
            className={`absolute top-0 bottom-0 w-px ${guideColor.border} border-l`}
            style={{ left: `${i * 16 + 14}px` }}
          />
        )
      })}
      <button
        onClick={() => {
          const ids = collectProjectIds(node, existingProjectIds)
          onSelect(node.id, ids)
        }}
        className={`w-full flex items-center gap-1 pr-2 ${lc.py} rounded-md transition-colors group ${
          isSelected
            ? 'bg-indigo-500/20 ring-1 ring-indigo-500/40'
            : 'hover:bg-white/[0.04]'
        }`}
        style={{ paddingLeft: `${node.level * 16 + 8}px` }}
      >
        {hasExpandableChildren ? (
          <span
            onClick={(e) => {
              e.stopPropagation()
              onToggle(node.id)
            }}
            className="w-4 h-4 flex items-center justify-center shrink-0 cursor-pointer text-white/30 hover:text-white/60"
          >
            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </span>
        ) : (
          <span className="w-4 h-4 flex items-center justify-center shrink-0">
            <span className={`w-1.5 h-1.5 rounded-full ${lc.dot} block`} />
          </span>
        )}
        <span className={`truncate flex-1 text-left ${lc.size} ${lc.text}`}>{node.label}</span>
        {projectCount > 0 && (
          <span className="text-[10px] text-teal-400/70 bg-teal-500/10 px-1.5 rounded-full shrink-0">
            {projectCount}
          </span>
        )}
      </button>
      {isExpanded && hasExpandableChildren && (
        <div>
          {childrenWithProjects.map((child) => (
            <FilterNode
              key={child.id}
              node={child}
              taxonomy={taxonomy}
              selectedNodeId={selectedNodeId}
              expandedIds={expandedIds}
              onToggle={onToggle}
              onSelect={onSelect}
              existingProjectIds={existingProjectIds}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function LibraryTaxonomyFilter({ selectedNodeId, onSelectNode }: LibraryTaxonomyFilterProps) {
  const { data: taxonomies } = useTaxonomies()
  const { data: projects } = useProjects()
  const existingProjectIds = useMemo(
    () => new Set((projects ?? []).map((p) => p.id)),
    [projects]
  )

  // Build trees + auto-expand nodes with projects
  const { trees, defaultExpanded } = useMemo(() => {
    if (!taxonomies || taxonomies.length === 0) return { trees: [], defaultExpanded: new Set<string>() }
    const result: { taxonomy: Taxonomy; tree: TaxonomyNodeWithChildren[] }[] = []
    const allExpand = new Set<string>()
    for (const tax of taxonomies) {
      const tree = buildTree(tax.nodes)
      const withProjects = tree.filter((n) => hasLinkedProjects(n, existingProjectIds))
      if (withProjects.length > 0) {
        result.push({ taxonomy: tax, tree: withProjects })
        const expandable = collectExpandableIds(withProjects, existingProjectIds)
        expandable.forEach((id) => allExpand.add(id))
      }
    }
    return { trees: result, defaultExpanded: allExpand }
  }, [taxonomies, existingProjectIds])

  // Tous les nœuds visibles sont développés par défaut. L'utilisateur peut ensuite
  // replier manuellement, mais à chaque rechargement (nouvelles taxonomies/projets)
  // on redéveloppe tout pour rester cohérent avec l'image mentale du panneau.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(defaultExpanded))

  useEffect(() => {
    setExpandedIds(new Set(defaultExpanded))
  }, [defaultExpanded])

  const handleToggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleSelect = useCallback((nodeId: string, projectIds: string[]) => {
    if (selectedNodeId === nodeId) {
      onSelectNode(null, [])
    } else {
      onSelectNode(nodeId, projectIds)
    }
  }, [selectedNodeId, onSelectNode])

  if (trees.length === 0) return null

  return (
    <div className="w-56 shrink-0 bg-[#141414] border-r border-white/[0.06] flex flex-col overflow-hidden">
      <div className="px-3 py-3 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-2 text-white/50">
          <FolderTree className="w-3.5 h-3.5" />
          <span className="text-[11px] font-medium uppercase tracking-wider">Filtrer</span>
        </div>
        {selectedNodeId && (
          <button
            onClick={() => onSelectNode(null, [])}
            className="text-white/30 hover:text-white/60 transition-colors"
            title="Effacer le filtre"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-1 py-1">
        {trees.map(({ taxonomy, tree }) => (
          <div key={taxonomy.id} className="mb-2">
            {trees.length > 1 && (
              <p className="px-2 py-1 text-[10px] font-semibold text-white/30 uppercase tracking-wider">
                {taxonomy.name}
              </p>
            )}
            {tree.map((node) => (
              <FilterNode
                key={node.id}
                node={node}
                taxonomy={taxonomy}
                selectedNodeId={selectedNodeId}
                expandedIds={expandedIds}
                onToggle={handleToggle}
                onSelect={handleSelect}
                existingProjectIds={existingProjectIds}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
