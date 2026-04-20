import { useMemo, useCallback, useState } from 'react'
import { ChevronRight, FolderTree, X, Package, ChevronDown, PanelLeftClose } from 'lucide-react'
import { toast } from 'sonner'
import { useExcelStore } from '@/stores/excel.store'
import { getTaxoColumns } from './taxonomyBuilder'
import { isRowEnriched } from './DataTable'
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
  const { sheets, activeSheetIndex, taxonomyNavFilter, setTaxonomyNavFilter, aiFilter, updateCell } = useExcelStore()
  const sheet = sheets[activeSheetIndex]
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null)

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

    let initialRows = sheet.rows
    if (aiFilter === 'enriched') initialRows = initialRows.filter(isRowEnriched)
    else if (aiFilter === 'raw') initialRows = initialRows.filter((r) => !isRowEnriched(r))

    return buildLevel(0, initialRows, [])
  }, [sheet, taxoCols, taxonomyNavFilter, aiFilter])

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

  const hasFilters = Object.keys(taxonomyNavFilter).length > 0

  // Count total filtered rows
  const filteredCount = useMemo(() => {
    if (!sheet) return 0
    let rows = sheet.rows
    if (aiFilter === 'enriched') rows = rows.filter(isRowEnriched)
    else if (aiFilter === 'raw') rows = rows.filter((r) => !isRowEnriched(r))
    if (!hasFilters) return rows.length
    for (const [colKey, value] of Object.entries(taxonomyNavFilter)) {
      rows = rows.filter((r) => String(r[colKey]) === value)
    }
    return rows.length
  }, [sheet, taxonomyNavFilter, hasFilters, aiFilter])

  if (!sheet || taxoCols.length === 0) {
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
          <span className="text-[10px] text-white/30 flex items-center gap-1">
            <Package className="w-2.5 h-2.5" />
            {filteredCount}
          </span>
        </div>
      )}

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        <TreeLevel
          nodes={rootNodes}
          onSelect={handleSelect}
          dropTargetKey={dropTargetKey}
          setDropTargetKey={setDropTargetKey}
          onDropRow={handleDropOnNode}
        />
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

