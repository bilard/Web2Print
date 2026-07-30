// Rail gauche du chemin de fer : la taxonomie (univers › famille › sous-famille)
// avec les stats de chaque nœud (produits, pages, plage p. X–Y). Cliquer un nœud
// surligne ses pages dans la nappe et y fait défiler la vue.
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import type { CatalogTreeNode } from '../../catalogTypes'
import { subtreeProductCount } from '../../catalogTree'
import type { NodePageRange } from '../../catalogFlatplan'
import { LEVEL_STYLES } from './levelStyles'
import { t } from '@/lib/i18n'

interface Props {
  tree: CatalogTreeNode[]
  ranges: Map<string, NodePageRange>
  colors: Map<string, string>
  selectedNode: string | null
  onSelect: (nodeId: string | null) => void
}

function RangeChip({ range }: { range: NodePageRange | undefined }) {
  if (!range) return null
  return (
    <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
      {range.first === range.last ? `p. ${range.first}` : `p. ${range.first}–${range.last}`}
    </span>
  )
}

/** Alphas hex du fond de ligne par niveau — MÊME dégressivité que la carte
 *  Sections (PlanSectionRow) : cohérence des interfaces du module. */
const ROW_ALPHA: Record<1 | 2 | 3, string> = { 1: '2E', 2: '1A', 3: '0D' }

function NodeRow({ node, ranges, colors, selectedNode, onSelect, chapterColor }: Props & { node: CatalogTreeNode; chapterColor: string }) {
  const [collapsed, setCollapsed] = useState(false)
  const count = subtreeProductCount(node)
  if (count === 0) return null
  const style = LEVEL_STYLES[node.level]
  const range = ranges.get(node.id)
  const active = selectedNode === node.id
  const children = node.children.filter((c) => subtreeProductCount(c) > 0)
  return (
    <div>
      <div className={`flex items-center gap-1 rounded-md ${active ? 'ring-1 ring-indigo-500' : ''}`}
        style={{ background: active ? undefined : `${chapterColor}${ROW_ALPHA[node.level]}` }}>
        {node.level === 1 && children.length > 0 ? (
          <button onClick={() => setCollapsed((v) => !v)} className="p-0.5 shrink-0 text-muted-foreground hover:text-white" title={t(collapsed ? 'ui.expand' : 'ui.collapse')}>
            {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        ) : <span className="w-4 shrink-0" />}
        <button onClick={() => onSelect(active ? null : node.id)}
          className="flex-1 min-w-0 flex items-center gap-1.5 text-left px-1 py-1.5 rounded-md hover:bg-surface-2"
          title={`${count} produit${count > 1 ? 's' : ''}${range ? ` · ${range.pageCount} page${range.pageCount > 1 ? 's' : ''}` : ''}`}>
          <span className={`rounded-full shrink-0 ${node.level === 1 ? 'w-2 h-2' : 'w-1.5 h-1.5'}`} style={{ background: chapterColor }} />
          <span className={`truncate ${style.text}`} style={{ color: chapterColor }}>{node.label}</span>
          <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[10px] tabular-nums text-[#fff]" style={{ background: chapterColor }}>{count}</span>
          <span className="flex-1" />
          <RangeChip range={range} />
        </button>
      </div>
      {!collapsed && children.length > 0 && (
        <div className="ml-4 border-l border-border pl-1.5 mt-0.5 space-y-0.5">
          {children.map((c) => (
            <NodeRow key={c.id} node={c} tree={[]} ranges={ranges} colors={colors} selectedNode={selectedNode} onSelect={onSelect} chapterColor={chapterColor} />
          ))}
        </div>
      )}
    </div>
  )
}

export function FlatplanTaxonomy({ tree, ranges, colors, selectedNode, onSelect }: Props) {
  const universes = tree.filter((n) => subtreeProductCount(n) > 0)
  return (
    <div className="p-2 space-y-1">
      <button onClick={() => onSelect(null)}
        className={`w-full text-left px-2 py-1.5 rounded-md text-xs ${selectedNode === null ? 'bg-indigo-600 text-[#fff] font-medium' : 'text-muted-foreground hover:bg-surface-2 hover:text-white'}`}>
        Tout le catalogue
      </button>
      {universes.map((u) => (
        <NodeRow key={u.id} node={u} tree={tree} ranges={ranges} colors={colors} selectedNode={selectedNode} onSelect={onSelect}
          chapterColor={colors.get(u.id) ?? '#64748b'} />
      ))}
      {universes.length === 0 && <p className="px-2 py-4 text-xs text-muted-foreground">{t('cat.taxonomy.empty')}</p>}
    </div>
  )
}
