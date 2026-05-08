import { useMemo, useCallback, useState } from 'react'
import { ChevronRight, FolderTree, X, Package, ChevronDown, PanelLeftClose, Layers } from 'lucide-react'
import { toast } from 'sonner'
import { useExcelStore } from '@/stores/excel.store'
import { usePimStore } from '@/stores/pim.store'
import { useTaxonomies } from '@/features/taxonomy/useTaxonomies'
import {
  PRODUCT_TAXONOMY_ID_KEY,
  PRODUCT_TAXONOMY_NODE_ID_KEY,
  GLOBAL_TAXO_FILTER_KEY,
  encodeGlobalTaxoFilter,
  decodeGlobalTaxoFilter,
  buildGlobalTaxoFilterPredicate,
  getProductTaxonomyLink,
} from '@/features/taxonomy/productTaxonomy'
import { findPath } from '@/features/taxonomy/taxonomyUtils'
import type { Taxonomy, TaxonomyNode } from '@/features/taxonomy/types'
import { getTaxoColumns, getLevelColor } from './taxonomyBuilder'
import type { ExcelRow } from './types'

interface NodePath {
  colKey: string
  value: string
  level: number
}

interface TreeNode {
  value: string
  count: number
  level: number
  colKey: string
  color: string
  children: TreeNode[]
  isSelected: boolean
  isExpanded: boolean
  /** Chemin ancêtres → ce nœud (inclus), utilisé pour le drop product→taxonomy. */
  path: NodePath[]
}

export function TaxonomyNavigator({ onClose }: { onClose?: () => void } = {}) {
  const { sheets, activeSheetIndex, taxonomyNavFilter, setTaxonomyNavFilter, updateCell } = useExcelStore()
  const sheet = sheets[activeSheetIndex]
  const selectedSourceIds = usePimStore((s) => s.selectedSourceIds)
  const { data: taxonomies } = useTaxonomies()
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null)

  /** En BDD multi-sources, l'utilisateur n'a pas forcément sélectionné de
   *  source — la nav doit néanmoins montrer toutes les taxos liées dans la
   *  BDD pour qu'il puisse les explorer. On agrège sur toutes les sheets. */
  const allRowsInBdd = useMemo(() => sheets.flatMap((s) => s.rows), [sheets])

  /** Rows ciblées par la sélection courante :
   *  - mono-source : la sheet active.
   *  - multi-source avec sélection : les sheets cochées dans SheetsColumn.
   *  - multi-source sans sélection : juste la sheet active (fallback minimal).
   *  Pilote l'auto-expand de la nav globale. */
  const selectedRows = useMemo(() => {
    if (sheets.length <= 1) return sheet?.rows ?? []
    if (selectedSourceIds.length > 0) {
      return sheets.filter((s) => selectedSourceIds.includes(s.name)).flatMap((s) => s.rows)
    }
    return sheet?.rows ?? []
  }, [sheets, sheet, selectedSourceIds])

  const taxoCols = useMemo(() => {
    if (!sheet) return []
    return getTaxoColumns(sheet)
  }, [sheet])

  // Build the full tree structure
  const rootNodes = useMemo(() => {
    if (!sheet || taxoCols.length === 0) return []

    const buildLevel = (
      levelIdx: number,
      parentRows: ExcelRow[],
      parentPath: NodePath[],
    ): TreeNode[] => {
      if (levelIdx >= taxoCols.length) return []

      const { col, level, color } = taxoCols[levelIdx]
      const colKey = col.key
      const selectedValue = taxonomyNavFilter[colKey] ?? null

      const uniqueValues = [...new Set(
        parentRows
          .map((r) => r[colKey])
          .filter((v) => v !== null && v !== '' && v !== undefined)
          .map(String)
      )].sort((a, b) => a.localeCompare(b, 'fr'))

      return uniqueValues.map((val) => {
        const matchingRows = parentRows.filter((r) => String(r[colKey]) === val)
        const isSelected = selectedValue === val
        const isExpanded = isSelected
        const path: NodePath[] = [...parentPath, { colKey, value: val, level }]

        return {
          value: val,
          count: matchingRows.length,
          level,
          colKey,
          color,
          isSelected,
          isExpanded,
          path,
          children: isExpanded ? buildLevel(levelIdx + 1, matchingRows, path) : [],
        }
      })
    }

    return buildLevel(0, sheet.rows, [])
  }, [sheet, taxoCols, taxonomyNavFilter])

  // Drop d'un produit sur un nœud : assigne toute la chaîne de valeurs (root → nœud)
  // et vide les niveaux plus profonds pour éviter des valeurs orphelines.
  const handleDropOnNode = useCallback((rowId: string, node: TreeNode) => {
    if (!sheet) return
    for (const step of node.path) {
      updateCell(activeSheetIndex, rowId, step.colKey, step.value)
    }
    const deeperCols = taxoCols.filter((tc) => tc.level > node.level)
    for (const tc of deeperCols) {
      updateCell(activeSheetIndex, rowId, tc.col.key, null)
    }
    const pathLabel = node.path.map((p) => p.value).join(' > ')
    toast.success(`Produit classé sous ${pathLabel}`)
  }, [sheet, activeSheetIndex, updateCell, taxoCols])

  const handleSelect = useCallback((colKey: string, value: string, level: number) => {
    const newFilter = { ...taxonomyNavFilter }

    if (newFilter[colKey] === value) {
      // Deselect: remove this level and all below
      delete newFilter[colKey]
      for (const tc of taxoCols) {
        if (tc.level > level) delete newFilter[tc.col.key]
      }
    } else {
      newFilter[colKey] = value
      // Clear levels below when changing selection
      for (const tc of taxoCols) {
        if (tc.level > level) delete newFilter[tc.col.key]
      }
    }

    setTaxonomyNavFilter(newFilter)
  }, [taxonomyNavFilter, taxoCols, setTaxonomyNavFilter])

  const handleClearAll = () => setTaxonomyNavFilter({})

  // ── Section taxonomie globale ──────────────────────────────────────────────
  // Scope = toutes les sheets de la BDD (pas juste la sheet active) : en
  // multi-sources, l'utilisateur peut explorer la taxo sans avoir présélectionné
  // une source. On ne montre que les taxos avec au moins une row liée pour ne
  // pas noyer la nav avec tout le catalogue de taxos du compte.
  const linkedTaxonomies = useMemo(() => {
    if (!taxonomies || taxonomies.length === 0) return []
    const linkCounts = new Map<string, Map<string, number>>() // taxoId → nodeId → count
    for (const row of allRowsInBdd) {
      const link = getProductTaxonomyLink(row)
      if (!link) continue
      let m = linkCounts.get(link.taxonomyId)
      if (!m) { m = new Map(); linkCounts.set(link.taxonomyId, m) }
      m.set(link.nodeId, (m.get(link.nodeId) ?? 0) + 1)
    }
    if (linkCounts.size === 0) return []
    return taxonomies
      .filter((t) => linkCounts.has(t.id))
      .map((t) => ({ taxonomy: t, leafCounts: linkCounts.get(t.id)! }))
  }, [allRowsInBdd, taxonomies])

  /** Auto-expand : nœuds référencés par les rows des sources sélectionnées.
   *  Quand l'utilisateur coche/décoche des sources dans SheetsColumn, la nav
   *  globale ouvre/ferme dynamiquement les chemins correspondants.
   *  Map taxonomyId → Set<nodeId>. */
  const autoExpandByTaxoId = useMemo(() => {
    const out = new Map<string, Set<string>>()
    for (const row of selectedRows) {
      const link = getProductTaxonomyLink(row)
      if (!link) continue
      let s = out.get(link.taxonomyId)
      if (!s) { s = new Set(); out.set(link.taxonomyId, s) }
      s.add(link.nodeId)
    }
    return out
  }, [selectedRows])

  const globalFilterDecoded = useMemo(() => {
    const v = taxonomyNavFilter[GLOBAL_TAXO_FILTER_KEY]
    return v ? decodeGlobalTaxoFilter(v) : null
  }, [taxonomyNavFilter])

  const handleSelectGlobalNode = useCallback((taxonomyId: string, nodeId: string) => {
    const newFilter = { ...taxonomyNavFilter }
    const currentVal = newFilter[GLOBAL_TAXO_FILTER_KEY]
    const targetVal = encodeGlobalTaxoFilter(taxonomyId, nodeId)
    if (currentVal === targetVal) {
      delete newFilter[GLOBAL_TAXO_FILTER_KEY]
    } else {
      newFilter[GLOBAL_TAXO_FILTER_KEY] = targetVal
    }
    setTaxonomyNavFilter(newFilter)
  }, [taxonomyNavFilter, setTaxonomyNavFilter])

  const handleDropOnGlobalNode = useCallback((rowId: string, taxonomyId: string, nodeId: string, label: string) => {
    if (!sheet) return
    updateCell(activeSheetIndex, rowId, PRODUCT_TAXONOMY_ID_KEY, taxonomyId)
    updateCell(activeSheetIndex, rowId, PRODUCT_TAXONOMY_NODE_ID_KEY, nodeId)
    toast.success(`Produit classé sous « ${label} »`)
  }, [sheet, activeSheetIndex, updateCell])

  const hasFilters = Object.keys(taxonomyNavFilter).length > 0

  // Count total filtered rows. Quand le filtre globalTaxo est actif, on
  // élargit le scope à toutes les sheets (cohérent avec DataPage).
  const filteredCount = useMemo(() => {
    if (!sheet) return 0
    const globalFilter = taxonomyNavFilter[GLOBAL_TAXO_FILTER_KEY]
    const baseRows = globalFilter ? allRowsInBdd : sheet.rows
    if (!hasFilters) return baseRows.length
    const globalPredicate = globalFilter
      ? buildGlobalTaxoFilterPredicate(globalFilter, taxonomies)
      : null
    let rows = baseRows
    for (const [colKey, value] of Object.entries(taxonomyNavFilter)) {
      if (colKey === GLOBAL_TAXO_FILTER_KEY) continue
      rows = rows.filter((r) => String(r[colKey]) === value)
    }
    if (globalPredicate) rows = rows.filter(globalPredicate)
    return rows.length
  }, [sheet, allRowsInBdd, taxonomyNavFilter, hasFilters, taxonomies])

  const noColumnTree = !sheet || taxoCols.length === 0
  const noGlobalTree = linkedTaxonomies.length === 0

  if (noColumnTree && noGlobalTree) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-3 text-center px-4">
        <FolderTree className="w-8 h-8 text-white/15" />
        <p className="text-xs text-white/30">
          Assignez des niveaux de taxonomie dans le panneau droit pour naviguer
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-white/10 flex items-center justify-between shrink-0">
        <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider flex items-center gap-1.5">
          <FolderTree className="w-3.5 h-3.5" />
          Navigation
        </h3>
        <div className="flex items-center gap-1">
          {hasFilters && (
            <button
              onClick={handleClearAll}
              className="text-[10px] text-white/30 hover:text-white/60 px-1.5 py-0.5 rounded hover:bg-white/5 transition-colors flex items-center gap-1"
            >
              <X className="w-2.5 h-2.5" />
              Tout
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 text-white/40 hover:text-white/80 hover:bg-white/10 rounded transition-colors"
              title="Fermer la colonne"
            >
              <PanelLeftClose className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Breadcrumb */}
      {hasFilters && (
        <div className="px-3 py-2 border-b border-white/[0.06] flex items-center gap-1 flex-wrap">
          {taxoCols.map(({ col, color }) => {
            const selected = taxonomyNavFilter[col.key]
            if (!selected) return null
            return (
              <span key={col.key} className="flex items-center gap-1">
                <span
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: `${color}20`, color }}
                >
                  {selected}
                </span>
                <ChevronRight className="w-2.5 h-2.5 text-white/20" />
              </span>
            )
          })}
          {globalFilterDecoded && (() => {
            const tax = taxonomies?.find((t) => t.id === globalFilterDecoded.taxonomyId)
            const node = tax?.nodes[globalFilterDecoded.nodeId]
            if (!tax || !node) return null
            const color = getLevelColor(node.level + 1)
            return (
              <span className="flex items-center gap-1">
                <span
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded-full inline-flex items-center gap-1"
                  style={{ backgroundColor: `${color}20`, color }}
                >
                  <Layers className="w-2.5 h-2.5" />
                  {node.label}
                </span>
                <ChevronRight className="w-2.5 h-2.5 text-white/20" />
              </span>
            )
          })()}
          <span className="text-[10px] text-white/30 flex items-center gap-1">
            <Package className="w-2.5 h-2.5" />
            {filteredCount}
          </span>
        </div>
      )}

      {/* Sections */}
      <div className="flex-1 overflow-y-auto py-1">
        {/* Section colonnes de la sheet (legacy / par-niveau) */}
        {!noColumnTree && (
          <>
            {!noGlobalTree && (
              <div className="px-3 pt-1.5 pb-1 text-[9px] font-medium uppercase tracking-wider text-white/25">
                Colonnes
              </div>
            )}
            <TreeLevel
              nodes={rootNodes}
              onSelect={handleSelect}
              dropTargetKey={dropTargetKey}
              setDropTargetKey={setDropTargetKey}
              onDropRow={handleDropOnNode}
            />
          </>
        )}

        {/* Section taxonomie globale */}
        {!noGlobalTree && (
          <>
            <div className={`px-3 ${noColumnTree ? 'pt-1.5' : 'pt-3'} pb-1 text-[9px] font-medium uppercase tracking-wider text-white/25 flex items-center gap-1`}>
              <Layers className="w-2.5 h-2.5" />
              Taxonomie globale
            </div>
            {linkedTaxonomies.map(({ taxonomy, leafCounts }) => (
              <GlobalTaxoSubtree
                key={taxonomy.id}
                taxonomy={taxonomy}
                leafCounts={leafCounts}
                selectedNodeId={
                  globalFilterDecoded?.taxonomyId === taxonomy.id ? globalFilterDecoded.nodeId : null
                }
                autoExpandNodeIds={autoExpandByTaxoId.get(taxonomy.id)}
                onSelect={(nodeId) => handleSelectGlobalNode(taxonomy.id, nodeId)}
                onDropRow={(rowId, nodeId, label) => handleDropOnGlobalNode(rowId, taxonomy.id, nodeId, label)}
                dropTargetKey={dropTargetKey}
                setDropTargetKey={setDropTargetKey}
              />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

/** Clé stable pour identifier un nœud dans l'état de drag (colKey+value+level+parent) */
function nodeKey(node: TreeNode): string {
  return node.path.map((p) => `${p.colKey}::${p.value}`).join('/')
}

interface TreeLevelProps {
  nodes: TreeNode[]
  onSelect: (colKey: string, value: string, level: number) => void
  dropTargetKey: string | null
  setDropTargetKey: (k: string | null) => void
  onDropRow: (rowId: string, node: TreeNode) => void
}

function TreeLevel({ nodes, onSelect, dropTargetKey, setDropTargetKey, onDropRow }: TreeLevelProps) {
  if (nodes.length === 0) return null

  return (
    <div>
      {/* Items */}
      {nodes.map((node) => {
        const key = nodeKey(node)
        const isDropTarget = dropTargetKey === key
        return (
        <div key={node.value}>
          <button
            onClick={() => onSelect(node.colKey, node.value, node.level)}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes('application/x-product-row')) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              if (dropTargetKey !== key) setDropTargetKey(key)
            }}
            onDragLeave={(e) => {
              // Seulement reset si on quitte vraiment (pas un child element)
              if (e.currentTarget.contains(e.relatedTarget as Node)) return
              if (dropTargetKey === key) setDropTargetKey(null)
            }}
            onDrop={(e) => {
              const rowId = e.dataTransfer.getData('application/x-product-row')
              if (!rowId) return
              e.preventDefault()
              setDropTargetKey(null)
              onDropRow(rowId, node)
            }}
            className={`w-full text-left flex items-center gap-2 py-[5px] transition-colors group ${
              isDropTarget
                ? 'ring-2 ring-inset'
                : node.isSelected
                  ? 'bg-white/[0.06]'
                  : 'hover:bg-white/[0.03]'
            }`}
            style={{
              paddingLeft: `${(node.level - 1) * 16 + 12}px`,
              paddingRight: 12,
              ...(isDropTarget ? { backgroundColor: `${node.color}20`, boxShadow: `inset 0 0 0 2px ${node.color}` } : {}),
            }}
          >
            {/* Expand/collapse indicator */}
            <span className="w-3.5 shrink-0 flex items-center justify-center">
              {node.isSelected ? (
                <ChevronDown className="w-3 h-3" style={{ color: node.color }} />
              ) : (
                <ChevronRight className="w-3 h-3 text-white/15 group-hover:text-white/30" />
              )}
            </span>

            {/* Active bar */}
            {node.isSelected && (
              <div
                className="w-[3px] h-5 rounded-full shrink-0 -ml-1"
                style={{ backgroundColor: node.color }}
              />
            )}

            <span
              className={`flex-1 truncate leading-tight ${
                node.isSelected ? 'font-semibold' : ''
              }`}
              style={{
                fontSize: node.level === 1 ? '13px' : node.level === 2 ? '12px' : '11px',
                color: node.isSelected ? node.color : node.level === 1 ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.5)',
              }}
            >
              {node.value}
            </span>

            <span
              className={`tabular-nums ${node.isSelected ? 'text-white/50' : 'text-white/20'}`}
              style={{ fontSize: node.level === 1 ? '10px' : '9px' }}
            >
              {node.count}
            </span>
          </button>

          {/* Children (nested sub-level) */}
          {node.isExpanded && node.children.length > 0 && (
            <TreeLevel
              nodes={node.children}
              onSelect={onSelect}
              dropTargetKey={dropTargetKey}
              setDropTargetKey={setDropTargetKey}
              onDropRow={onDropRow}
            />
          )}
        </div>
        )
      })}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Section taxonomie globale : arbre filtré aux ancêtres des nœuds liés
// ────────────────────────────────────────────────────────────────────────────

interface GlobalTaxoSubtreeProps {
  taxonomy: Taxonomy
  /** nodeId direct → nb de produits liés (sans descendance) */
  leafCounts: Map<string, number>
  selectedNodeId: string | null
  /** nodeIds dont le chemin doit être auto-expand (rows de la sheet active
   *  liées à cette taxo) — ouvre la nav vers les classifications du source. */
  autoExpandNodeIds?: Set<string>
  onSelect: (nodeId: string) => void
  onDropRow: (rowId: string, nodeId: string, label: string) => void
  dropTargetKey: string | null
  setDropTargetKey: (k: string | null) => void
}

interface GlobalTaxoTreeNode {
  node: TaxonomyNode
  count: number  // descendant + self
  children: GlobalTaxoTreeNode[]
  isExpanded: boolean
  isSelected: boolean
}

function GlobalTaxoSubtree({
  taxonomy, leafCounts, selectedNodeId, autoExpandNodeIds, onSelect, onDropRow, dropTargetKey, setDropTargetKey,
}: GlobalTaxoSubtreeProps) {
  // Calcule les counts cumulatifs (un nœud agrège lui-même + descendants directement liés)
  // et restreint l'arbre aux nœuds qui ont au moins 1 produit (ou sont sur un chemin
  // vers un nœud lié). Évite d'afficher toute la taxo, on ne montre que ce qui est utilisé.
  const tree = useMemo(() => {
    const allNodes = taxonomy.nodes
    // 1) Set des nœuds "intéressants" : nœud lié + tous ses ancêtres
    const keepIds = new Set<string>()
    for (const linkedId of leafCounts.keys()) {
      for (const ancestorId of findPath(allNodes, linkedId)) {
        keepIds.add(ancestorId)
      }
    }
    // 2) Counts cumulatifs (nœud + descendants liés)
    const cumulCounts = new Map<string, number>()
    const computeCumul = (id: string): number => {
      if (cumulCounts.has(id)) return cumulCounts.get(id)!
      let c = leafCounts.get(id) ?? 0
      for (const child of Object.values(allNodes)) {
        if (child.parentId === id && keepIds.has(child.id)) {
          c += computeCumul(child.id)
        }
      }
      cumulCounts.set(id, c)
      return c
    }
    for (const id of keepIds) computeCumul(id)

    // 3) Auto-expand : chemin du nœud sélectionné + chemins des nœuds liés
    //    aux rows de la sheet active (auto-révèle la classification du source).
    const expandedIds = new Set<string>()
    if (selectedNodeId) {
      for (const id of findPath(allNodes, selectedNodeId)) expandedIds.add(id)
    }
    if (autoExpandNodeIds) {
      for (const nodeId of autoExpandNodeIds) {
        for (const id of findPath(allNodes, nodeId)) expandedIds.add(id)
      }
    }

    // 4) Construit l'arbre filtré récursivement
    const buildBranch = (parentId: string | null): GlobalTaxoTreeNode[] => {
      return Object.values(allNodes)
        .filter((n) => n.parentId === parentId && keepIds.has(n.id))
        .sort((a, b) => a.order - b.order)
        .map((node) => ({
          node,
          count: cumulCounts.get(node.id) ?? 0,
          isSelected: selectedNodeId === node.id,
          isExpanded: expandedIds.has(node.id),
          children: expandedIds.has(node.id) ? buildBranch(node.id) : [],
        }))
    }

    return buildBranch(null)
  }, [taxonomy, leafCounts, selectedNodeId, autoExpandNodeIds])

  if (tree.length === 0) return null

  return (
    <div>
      <div className="px-3 py-1 text-[10px] text-white/40 truncate" title={taxonomy.name}>
        {taxonomy.name}
      </div>
      <GlobalTaxoLevel
        taxonomyId={taxonomy.id}
        nodes={tree}
        depth={0}
        onSelect={onSelect}
        onDropRow={onDropRow}
        dropTargetKey={dropTargetKey}
        setDropTargetKey={setDropTargetKey}
      />
    </div>
  )
}

interface GlobalTaxoLevelProps {
  taxonomyId: string
  nodes: GlobalTaxoTreeNode[]
  depth: number
  onSelect: (nodeId: string) => void
  onDropRow: (rowId: string, nodeId: string, label: string) => void
  dropTargetKey: string | null
  setDropTargetKey: (k: string | null) => void
}

function GlobalTaxoLevel({
  taxonomyId, nodes, depth, onSelect, onDropRow, dropTargetKey, setDropTargetKey,
}: GlobalTaxoLevelProps) {
  if (nodes.length === 0) return null
  return (
    <div>
      {nodes.map((tn) => {
        const dragKey = `${GLOBAL_TAXO_FILTER_KEY}::${taxonomyId}::${tn.node.id}`
        const isDropTarget = dropTargetKey === dragKey
        // Couleur par profondeur — même palette que la section "Colonnes"
        // pour que les niveaux soient visuellement cohérents entre les deux
        // arbres. depth est 0-indexé, getLevelColor attend du 1-indexé.
        const color = getLevelColor(depth + 1)
        // Un nœud "actif" = sélectionné OU sur le chemin vers la sélection
        // (auto-expand). On colore le label de tous les actifs pour matérialiser
        // la chaîne hiérarchique du filtre courant.
        const isActive = tn.isSelected || tn.isExpanded
        return (
          <div key={tn.node.id}>
            <button
              onClick={() => onSelect(tn.node.id)}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes('application/x-product-row')) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (dropTargetKey !== dragKey) setDropTargetKey(dragKey)
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return
                if (dropTargetKey === dragKey) setDropTargetKey(null)
              }}
              onDrop={(e) => {
                const rowId = e.dataTransfer.getData('application/x-product-row')
                if (!rowId) return
                e.preventDefault()
                setDropTargetKey(null)
                onDropRow(rowId, tn.node.id, tn.node.label)
              }}
              className={`w-full text-left flex items-center gap-2 py-[5px] transition-colors group ${
                isDropTarget
                  ? 'ring-2 ring-inset'
                  : tn.isSelected
                    ? 'bg-white/[0.06]'
                    : 'hover:bg-white/[0.03]'
              }`}
              style={{
                paddingLeft: `${depth * 16 + 12}px`,
                paddingRight: 12,
                ...(isDropTarget ? { backgroundColor: `${color}20`, boxShadow: `inset 0 0 0 2px ${color}` } : {}),
              }}
            >
              <span className="w-3.5 shrink-0 flex items-center justify-center">
                {tn.isExpanded ? (
                  <ChevronDown className="w-3 h-3" style={{ color }} />
                ) : (
                  <ChevronRight className="w-3 h-3 text-white/15 group-hover:text-white/30" />
                )}
              </span>

              {tn.isSelected && (
                <div
                  className="w-[3px] h-5 rounded-full shrink-0 -ml-1"
                  style={{ backgroundColor: color }}
                />
              )}

              <span
                className={`flex-1 truncate leading-tight ${tn.isSelected ? 'font-semibold' : ''}`}
                style={{
                  fontSize: depth === 0 ? '13px' : depth === 1 ? '12px' : '11px',
                  color: isActive ? color : depth === 0 ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.5)',
                }}
              >
                {tn.node.label}
              </span>

              <span
                className="tabular-nums"
                style={{
                  fontSize: depth === 0 ? '10px' : '9px',
                  color: isActive ? `${color}b3` : 'rgba(255,255,255,0.2)',
                }}
              >
                {tn.count}
              </span>
            </button>

            {tn.isExpanded && tn.children.length > 0 && (
              <GlobalTaxoLevel
                taxonomyId={taxonomyId}
                nodes={tn.children}
                depth={depth + 1}
                onSelect={onSelect}
                onDropRow={onDropRow}
                dropTargetKey={dropTargetKey}
                setDropTargetKey={setDropTargetKey}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

