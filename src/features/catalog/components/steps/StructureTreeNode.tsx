// src/features/catalog/components/steps/StructureTreeNode.tsx
// Ligne d'arbre récursive : libellé renommable (double-clic), compteur produits
// du sous-arbre, réordonnancement parmi les frères. L'arbre lui-même n'est jamais
// stocké — seuls les édits (renames/order) le sont, via useCatalogStore.
import { useState } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { useCatalogStore } from '@/stores/catalog.store'
import { flattenTree } from '../../catalogTree'
import type { CatalogTreeNode } from '../../catalogTypes'
import { LEVEL_STYLES } from './levelStyles'

interface StructureTreeNodeProps {
  node: CatalogTreeNode
  /** ids de tous les frères (dont ce nœud), dans l'ordre d'affichage courant. */
  siblingIds: string[]
  index: number
  /** id du parent, '' à la racine — clé de `treeEdits.order`. */
  parentId: string
  depth: number
}

/** Retrouve le libellé BRUT (avant renames) d'un nœud affiché, en inversant `renames`. */
function findOriginalLabel(renames: Record<string, string>, level: number, displayedLabel: string): string {
  const entry = Object.entries(renames).find(([k, v]) => k.startsWith(`${level}:`) && v === displayedLabel)
  return entry ? entry[0].split(':').slice(1).join(':') : displayedLabel
}

/** Compte les produits du sous-arbre (nœud inclus). */
function countProducts(node: CatalogTreeNode): number {
  return flattenTree([node]).reduce((sum, n) => sum + n.productIds.length, 0)
}

export function StructureTreeNode({ node, siblingIds, index, parentId, depth }: StructureTreeNodeProps) {
  const treeEdits = useCatalogStore((s) => s.treeEdits)
  const setTreeEdits = useCatalogStore((s) => s.setTreeEdits)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(node.label)

  const commitRename = () => {
    const value = draft.trim()
    setEditing(false)
    if (!value || value === node.label) { setDraft(node.label); return }
    const origine = findOriginalLabel(treeEdits.renames, node.level, node.label)
    setTreeEdits({ renames: { ...treeEdits.renames, [`${node.level}:${origine}`]: value } })
  }

  const move = (delta: -1 | 1) => {
    const target = index + delta
    if (target < 0 || target >= siblingIds.length) return
    const next = [...siblingIds]
    ;[next[index], next[target]] = [next[target], next[index]]
    setTreeEdits({ order: { ...treeEdits.order, [parentId]: next } })
  }

  const productCount = countProducts(node)
  const st = LEVEL_STYLES[node.level]

  return (
    <div className={node.level === 1 ? 'mt-2 first:mt-0' : ''}>
      <div className={`flex items-center gap-2 py-1.5 px-2 group rounded-md ${st.row}`} style={{ marginLeft: depth * 24 }}>
        <div className="flex flex-col shrink-0">
          <button onClick={() => move(-1)} disabled={index === 0} title="Monter"
            className="h-4 flex items-center justify-center text-muted-foreground hover:text-white disabled:opacity-20 disabled:cursor-not-allowed">
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => move(1)} disabled={index === siblingIds.length - 1} title="Descendre"
            className="h-4 flex items-center justify-center text-muted-foreground hover:text-white disabled:opacity-20 disabled:cursor-not-allowed">
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
        <span className={`w-2 h-2 rounded-full shrink-0 ${st.dot}`} />

        {editing ? (
          <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              else if (e.key === 'Escape') { setDraft(node.label); setEditing(false) }
            }}
            className="flex-1 min-w-0 px-2 py-1 rounded-md bg-surface-2 text-sm text-white outline-none focus:ring-1 focus:ring-indigo-600" />
        ) : (
          <span onDoubleClick={() => { setDraft(node.label); setEditing(true) }}
            className={`flex-1 min-w-0 truncate cursor-text ${st.text}`} title="Double-cliquer pour renommer">
            {node.label}
          </span>
        )}

        <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums ${st.badge}`}>
          {productCount} produit{productCount > 1 ? 's' : ''}
        </span>
      </div>

      {node.children.length > 0 && (
        <div>
          {node.children.map((child, i) => (
            <StructureTreeNode key={child.id} node={child} siblingIds={node.children.map((c) => c.id)}
              index={i} parentId={node.id} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}
