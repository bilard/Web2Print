import { useMemo, useCallback } from 'react'
import { ChevronRight, FolderTree, X, Package, ChevronDown } from 'lucide-react'
import { useExcelStore } from '@/stores/excel.store'
import { getTaxoColumns } from './taxonomyBuilder'
import { isRowEnriched } from './DataTable'
import type { ExcelRow } from './types'

interface TreeNode {
  value: string
  count: number
  level: number
  colKey: string
  color: string
  children: TreeNode[]
  isSelected: boolean
  isExpanded: boolean
}

export function TaxonomyNavigator() {
  const { sheets, activeSheetIndex, taxonomyNavFilter, setTaxonomyNavFilter, aiFilter } = useExcelStore()
  const sheet = sheets[activeSheetIndex]

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

        return {
          value: val,
          count: matchingRows.length,
          level,
          colKey,
          color,
          isSelected,
          isExpanded,
          children: isExpanded ? buildLevel(levelIdx + 1, matchingRows) : [],
        }
      })
    }

    let initialRows = sheet.rows
    if (aiFilter === 'enriched') initialRows = initialRows.filter(isRowEnriched)
    else if (aiFilter === 'raw') initialRows = initialRows.filter((r) => !isRowEnriched(r))

    return buildLevel(0, initialRows)
  }, [sheet, taxoCols, taxonomyNavFilter, aiFilter])

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
        {hasFilters && (
          <button
            onClick={handleClearAll}
            className="text-[10px] text-white/30 hover:text-white/60 px-1.5 py-0.5 rounded hover:bg-white/5 transition-colors flex items-center gap-1"
          >
            <X className="w-2.5 h-2.5" />
            Tout
          </button>
        )}
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
        <TreeLevel nodes={rootNodes} onSelect={handleSelect} />
      </div>
    </div>
  )
}

function TreeLevel({ nodes, onSelect }: {
  nodes: TreeNode[]
  onSelect: (colKey: string, value: string, level: number) => void
}) {
  if (nodes.length === 0) return null

  // Group label from first node
  const { level, color, colKey } = nodes[0]

  return (
    <div>
      {/* Level label */}
      <div
        className="flex items-center gap-2 px-3 mt-1 mb-0.5"
        style={{
          paddingLeft: `${(level - 1) * 16 + 12}px`,
          paddingTop: level === 1 ? '8px' : '4px',
          paddingBottom: level === 1 ? '4px' : '2px',
        }}
      >
        <div
          className="shrink-0 rounded-full"
          style={{
            backgroundColor: color,
            width: level === 1 ? '7px' : '5px',
            height: level === 1 ? '7px' : '5px',
          }}
        />
        <span
          className="font-bold uppercase tracking-wider"
          style={{
            fontSize: level === 1 ? '10px' : '9px',
            color: `${color}${level === 1 ? 'cc' : '80'}`,
          }}
        >
          <LevelLabel colKey={colKey} />
        </span>
        <span
          className="tabular-nums bg-white/[0.06] px-1 rounded-full"
          style={{ fontSize: level === 1 ? '9px' : '8px', color: 'rgba(255,255,255,0.25)' }}
        >
          {nodes.length}
        </span>
      </div>

      {/* Items */}
      {nodes.map((node) => (
        <div key={node.value}>
          <button
            onClick={() => onSelect(node.colKey, node.value, node.level)}
            className={`w-full text-left flex items-center gap-2 py-[5px] transition-colors group ${
              node.isSelected
                ? 'bg-white/[0.06]'
                : 'hover:bg-white/[0.03]'
            }`}
            style={{ paddingLeft: `${(node.level - 1) * 16 + 12}px`, paddingRight: 12 }}
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
            <TreeLevel nodes={node.children} onSelect={onSelect} />
          )}
        </div>
      ))}
    </div>
  )
}

/** Helper to get column label from store */
function LevelLabel({ colKey }: { colKey: string }) {
  const sheets = useExcelStore((s) => s.sheets)
  const idx = useExcelStore((s) => s.activeSheetIndex)
  const sheet = sheets[idx]
  const col = sheet?.columns.find((c) => c.key === colKey)
  return <>{col?.label ?? colKey}</>
}
