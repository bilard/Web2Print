import { useState, useRef, useCallback, useMemo, Fragment, type RefObject, type MouseEvent as ReactMouseEvent } from 'react'
import { Plus, Trash2, GripVertical, Key, ArrowUp, ArrowDown, ArrowUpDown, Expand, ChevronRight, ChevronDown, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { useExcelStore } from '@/stores/excel.store'
import { FieldTypeSelector } from './FieldTypeSelector'
import { StatsBadges } from './StatsBadges'
import { ColumnMenu } from './ColumnMenu'
import { AddColumnMenu } from './AddColumnMenu'
import { FormulaEditor } from './FormulaEditor'
import { evaluateFormula } from './formulaEngine'
import { getTaxoColumns } from './taxonomyBuilder'
import type { ExcelColumn, ExcelRow, CellValue, FieldTypeId } from './types'

type SortDir = 'asc' | 'desc' | 'color' | null

const numericTypes: FieldTypeId[] = ['number', 'currency', 'percent', 'rating']

/** Clés des colonnes d'enrichissement IA (cf. useSaveEnrichedProduct.ENRICHMENT_COLUMNS) */
const AI_ENRICHMENT_KEYS = [
  'ai_description',
  'ai_advantages',
  'ai_specifications',
  'ai_images',
  'ai_documents',
  'ai_source',
  'ai_scraper',
  'ai_llm_model',
  'ai_llm_request',
] as const

/** Une ligne est considérée comme enrichie si au moins un de ses champs ai_* est rempli. */
export function isRowEnriched(row: ExcelRow): boolean {
  return AI_ENRICHMENT_KEYS.some((k) => {
    const v = row[k]
    return typeof v === 'string' ? v.trim().length > 0 : v != null
  })
}

export function DataTable() {
  const {
    sheets, activeSheetIndex, searchQuery, taxonomyNavFilter, groupByTaxonomy, aiFilter,
    updateColumnType, setColumnPrimary, updateCell, deleteRow, addRow,
    updateColumnWidth, moveColumn, moveColumnTo, hideColumn, updateColumnFormula, addColumn,
    updateColumnLabel, updateColumnDecimals, reorderColumns,
  } = useExcelStore()
  const sheet = sheets[activeSheetIndex]
  const [editingCell, setEditingCell] = useState<{ rowId: string; colKey: string } | null>(null)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Sort state
  const [sortColKey, setSortColKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)

  // Resize state
  const resizeRef = useRef<{ colKey: string; startX: number; startWidth: number } | null>(null)

  // Formula editor state
  const [editingFormula, setEditingFormula] = useState<string | null>(null)

  // Column rename state
  const [renamingCol, setRenamingCol] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  // Grouping: collapsed groups (key = "level:value" or "level:parent>value")
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const setSheetRowId = useExcelStore((s) => s.setSheetRowId)

  // Column drag state
  const [dragColIdx, setDragColIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  if (!sheet) return null

  const hiddenCols = new Set(sheet.hiddenColumns ?? [])
  // Masquer aussi les colonnes utilisées comme niveaux de taxonomie quand le groupement est actif
  const taxoLevels = sheet.taxonomyLevels ?? {}
  if (groupByTaxonomy) {
    for (const key of Object.keys(taxoLevels)) {
      if (taxoLevels[key] > 0) hiddenCols.add(key)
    }
  }
  const visibleColumns = sheet.columns.filter((c) => !hiddenCols.has(c.key))
  const formatStatValue = (v: number | string | null, ft: FieldTypeId) => {
    if (v === null) return '—'
    if (typeof v === 'string') return v
    if (ft === 'currency') return `${v.toLocaleString('fr-FR')} €`
    if (ft === 'percent') return `${v}%`
    return v.toLocaleString('fr-FR')
  }
  const getColWidth = (col: ExcelColumn) => {
    // Header needs: grip(20) + label + sort(28) + menu(28) + padding(24) ≈ 100 + label
    const firstWord = col.label.split(/\s+/)[0] ?? col.label
    const labelMin = 100 + firstWord.length * 8

    if (!col.stats || !numericTypes.includes(col.fieldType)) return Math.max(col.width, labelMin, 80)
    const { min, max, avg } = col.stats
    const texts = [min, avg, max].filter((v) => v !== null)
    // Each badge: icon(10) + gap(4) + text + px(12) + border(2) ≈ 28 + charWidth
    const badgesWidth = texts.reduce((sum: number, v) => {
      const len = formatStatValue(v, col.fieldType).length
      return sum + 28 + len * 7
    }, 0) + ((texts.length - 1) * 6 + 24) // gaps + cell padding
    return Math.max(col.width, badgesWidth, labelMin)
  }

  const startRename = (colKey: string) => {
    const col = sheet.columns.find((c) => c.key === colKey)
    if (!col) return
    setRenamingCol(colKey)
    setRenameValue(col.label)
    setTimeout(() => renameInputRef.current?.select(), 30)
  }

  const commitRename = () => {
    if (renamingCol && renameValue.trim()) {
      updateColumnLabel(activeSheetIndex, renamingCol, renameValue.trim())
    }
    setRenamingCol(null)
  }

  const handleAddColumn = (type: FieldTypeId, label: string, position?: 'start' | 'end') => {
    const colKey = `${type}_${Date.now()}`
    addColumn(activeSheetIndex, {
      key: colKey,
      label,
      fieldType: type,
      detectedType: type,
      isPrimary: false,
      width: 180,
      ...(type === 'formula' ? { formula: '' } : {}),
    }, position)
    if (type === 'formula') setEditingFormula(colKey)
  }

  // Filter rows by taxonomy navigation + search
  const navFilterEntries = Object.entries(taxonomyNavFilter)
  let filteredRows = sheet.rows
  if (navFilterEntries.length > 0) {
    filteredRows = filteredRows.filter((row) =>
      navFilterEntries.every(([colKey, value]) => String(row[colKey]) === value)
    )
  }
  if (searchQuery) {
    filteredRows = filteredRows.filter((row) =>
      sheet.columns.some((col) => {
        const v = row[col.key]
        return v !== null && String(v).toLowerCase().includes(searchQuery.toLowerCase())
      }),
    )
  }
  if (aiFilter === 'enriched') {
    filteredRows = filteredRows.filter(isRowEnriched)
  } else if (aiFilter === 'raw') {
    filteredRows = filteredRows.filter((r) => !isRowEnriched(r))
  }

  // Sort rows
  const sortedRows = (() => {
    if (!sortColKey || !sortDir) return filteredRows
    const col = sheet.columns.find((c) => c.key === sortColKey)
    if (!col) return filteredRows

    // Tri par zone de couleur (bleu 0-33% → jaune 33-67% → vert 67-100%)
    if (sortDir === 'color' && col.stats) {
      const min = typeof col.stats.min === 'number' ? col.stats.min : 0
      const max = typeof col.stats.max === 'number' ? col.stats.max : 0
      const range = max - min
      if (range === 0) return filteredRows

      const getColorZone = (v: CellValue): number => {
        const num = getNumericValue(v)
        if (num === null) return 3 // nulls en dernier
        const ratio = (num - min) / range
        if (ratio <= 0.33) return 0  // bleu
        if (ratio >= 0.67) return 2  // vert
        return 1                      // jaune
      }

      return [...filteredRows].sort((a, b) => {
        const zA = getColorZone(a[sortColKey])
        const zB = getColorZone(b[sortColKey])
        if (zA !== zB) return zA - zB
        // Au sein de la même zone, tri par valeur croissante
        const numA = getNumericValue(a[sortColKey]) ?? 0
        const numB = getNumericValue(b[sortColKey]) ?? 0
        return numA - numB
      })
    }

    return [...filteredRows].sort((a, b) => {
      const va = a[sortColKey]
      const vb = b[sortColKey]
      if (va === null || va === undefined) return 1
      if (vb === null || vb === undefined) return -1

      const numA = getNumericValue(va)
      const numB = getNumericValue(vb)

      let cmp: number
      if (numA !== null && numB !== null) {
        cmp = numA - numB
      } else {
        cmp = String(va).localeCompare(String(vb), 'fr', { sensitivity: 'base' })
      }
      return sortDir === 'desc' ? -cmp : cmp
    })
  })()

  // Taxonomy grouping
  const taxoCols = useMemo(() => {
    if (!sheet) return []
    return getTaxoColumns(sheet)
  }, [sheet])

  const toggleGroup = useCallback((groupKey: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupKey)) next.delete(groupKey)
      else next.add(groupKey)
      return next
    })
  }, [])

  const [dropGroupKey, setDropGroupKey] = useState<string | null>(null)

  // Drop d'un produit sur un header de groupe : applique toute la chaîne de
  // valeurs (root → groupe) et vide les niveaux plus profonds.
  const handleDropOnGroup = useCallback((rowId: string, group: RowGroup) => {
    if (group.path.length === 0) return // dropping sur "(vide)" = no-op
    for (const step of group.path) {
      updateCell(activeSheetIndex, rowId, step.colKey, step.value)
    }
    for (const tc of taxoCols) {
      if (tc.level > group.level) updateCell(activeSheetIndex, rowId, tc.col.key, null)
    }
    const pathLabel = group.path.map((p) => p.value).join(' > ')
    toast.success(`Produit classé sous ${pathLabel}`)
  }, [activeSheetIndex, updateCell, taxoCols])

  // Build grouped rows structure
  // Skip taxonomy levels that are already selected in the nav filter —
  // start grouping from the first level AFTER the deepest selected filter
  const groupedData = useMemo((): (RowGroup | ExcelRow)[] => {
    if (taxoCols.length === 0) return sortedRows

    // Find the first taxo level index that is NOT filtered
    const filterKeys = new Set(Object.keys(taxonomyNavFilter))
    let startIdx = 0
    for (let i = 0; i < taxoCols.length; i++) {
      if (filterKeys.has(taxoCols[i].col.key)) {
        startIdx = i + 1
      } else {
        break
      }
    }

    // If all levels are filtered, show flat rows
    if (startIdx >= taxoCols.length) return sortedRows

    const buildGroups = (
      rows: ExcelRow[],
      levelIdx: number,
      parentKey: string,
      parentPath: { colKey: string; value: string; level: number }[],
    ): (RowGroup | ExcelRow)[] => {
      if (levelIdx >= taxoCols.length) return rows

      const { col, level, color } = taxoCols[levelIdx]
      const groups = new Map<string, ExcelRow[]>()
      const order: string[] = []

      for (const row of rows) {
        const val = row[col.key] !== null && row[col.key] !== undefined && row[col.key] !== ''
          ? String(row[col.key])
          : '(vide)'
        if (!groups.has(val)) {
          groups.set(val, [])
          order.push(val)
        }
        groups.get(val)!.push(row)
      }

      // If only 1 unique value and it's not meaningful, skip grouping
      if (order.length === 1 && order[0] === '(vide)') return rows

      return order.map((val) => {
        const groupRows = groups.get(val)!
        const groupKey = parentKey ? `${parentKey}>${val}` : `${level}:${val}`
        const path = val === '(vide)' ? parentPath : [...parentPath, { colKey: col.key, value: val, level }]
        return {
          key: groupKey,
          value: val,
          level,
          color,
          colLabel: col.label,
          colKey: col.key,
          path,
          count: groupRows.length,
          children: buildGroups(groupRows, levelIdx + 1, groupKey, path),
        } as RowGroup
      })
    }

    return buildGroups(sortedRows, startIdx, '', [])
  }, [sortedRows, taxoCols, taxonomyNavFilter])

  const handleSort = (colKey: string) => {
    if (sortColKey === colKey) {
      if (sortDir === 'asc') setSortDir('desc')
      else if (sortDir === 'desc' || sortDir === 'color') { setSortColKey(null); setSortDir(null) }
      else setSortDir('asc')
    } else {
      setSortColKey(colKey)
      setSortDir('asc')
    }
  }

  // Resize handlers
  const handleResizeStart = useCallback((e: ReactMouseEvent, colKey: string, currentWidth: number) => {
    e.preventDefault()
    e.stopPropagation()
    resizeRef.current = { colKey, startX: e.clientX, startWidth: currentWidth }

    const handleMouseMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return
      const delta = ev.clientX - resizeRef.current.startX
      const newWidth = Math.max(80, resizeRef.current.startWidth + delta)
      updateColumnWidth(activeSheetIndex, resizeRef.current.colKey, newWidth)
    }

    const handleMouseUp = () => {
      resizeRef.current = null
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [activeSheetIndex, updateColumnWidth])

  const startEdit = (rowId: string, colKey: string, value: CellValue) => {
    setEditingCell({ rowId, colKey })
    setEditValue(value !== null ? String(value) : '')
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const commitEdit = () => {
    if (!editingCell) return
    const col = sheet.columns.find((c) => c.key === editingCell.colKey)
    let finalValue: CellValue = editValue

    if (col && ['number', 'currency', 'percent', 'rating'].includes(col.fieldType)) {
      const num = parseFloat(editValue.replace(',', '.').replace(/[€$%]/g, ''))
      finalValue = isNaN(num) ? editValue : num
    } else if (col?.fieldType === 'checkbox') {
      finalValue = ['true', 'oui', 'yes', '1'].includes(editValue.toLowerCase())
    }

    updateCell(activeSheetIndex, editingCell.rowId, editingCell.colKey, finalValue)
    setEditingCell(null)
  }

  const handleAddRow = () => {
    const newRow: Record<string, CellValue> = { _id: `row_${Date.now()}` }
    for (const col of sheet.columns) newRow[col.key] = null
    addRow(activeSheetIndex, newRow as any)
  }

  const formatCell = (value: CellValue, col: ExcelColumn): string => {
    if (value === null || value === undefined) return ''
    if (col.fieldType === 'checkbox') return value ? '✓' : '✗'
    // Numeric types with configurable decimals
    if (['number', 'currency', 'percent'].includes(col.fieldType)) {
      const num = getNumericValue(value)
      if (num !== null) {
        const d = col.decimals ?? 2
        const formatted = num.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d })
        if (col.fieldType === 'currency') return `${formatted} €`
        if (col.fieldType === 'percent') return `${formatted}%`
        return formatted
      }
    }
    // Formula with number result type and decimals
    if (col.fieldType === 'formula' && col.formulaResultType === 'number') {
      const num = getNumericValue(value)
      if (num !== null) {
        const d = col.formulaDecimals ?? 2
        return num.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d })
      }
    }
    return String(value)
  }

  const getCellColorStyle = (value: CellValue, col: ExcelColumn): { bg: string; text: string } | null => {
    if (!col.stats) return null
    if (!['number', 'currency', 'percent', 'rating'].includes(col.fieldType)) return null
    const numVal = getNumericValue(value)
    if (numVal === null) return null
    const { min, max, avg } = col.stats
    if (min === null || max === null || typeof min !== 'number' || typeof max !== 'number') return null
    if (avg === null || typeof avg !== 'number') return null
    const range = max - min
    if (range === 0) return null

    // Position 0→1 relative au range
    const ratio = (numVal - min) / range

    // 3 zones égales basées sur le tiers inférieur / moyen / supérieur
    if (ratio <= 0.33) {
      // Tiers inférieur → bleu, intensité croissante vers le min
      const intensity = 0.06 + (1 - ratio / 0.33) * 0.10
      return { bg: `rgba(59,130,246,${intensity.toFixed(2)})`, text: '#60a5fa' }
    }
    if (ratio >= 0.67) {
      // Tiers supérieur → vert, intensité croissante vers le max
      const intensity = 0.06 + ((ratio - 0.67) / 0.33) * 0.10
      return { bg: `rgba(34,197,94,${intensity.toFixed(2)})`, text: '#4ade80' }
    }

    // Tiers central → jaune subtil
    return { bg: 'rgba(234,179,8,0.07)', text: '#facc15' }
  }

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
        {/* Colgroup for fixed widths */}
        <colgroup>
          <col style={{ width: 40 }} />
          {visibleColumns.map((col) => (
            <col key={col.key} style={{ width: getColWidth(col) }} />
          ))}
          <col style={{ width: 40 }} />
        </colgroup>

        {/* Header — each th is sticky individually for proper scroll behavior */}
        <thead>
          {/* Row 1: Column name */}
          <tr>
            <th className="sticky top-0 left-0 z-30 w-10 bg-[#141414] border-b-2 border-r border-white/[0.08] align-middle">
              <AddColumnMenu onAdd={(type, label) => handleAddColumn(type, label, 'start')} />
            </th>
            {visibleColumns.map((col, colIdx) => (
              <th
                key={col.key}
                className={`sticky top-0 z-20 bg-[#141414] border-b-2 border-r border-white/[0.08] text-left relative group/col transition-all ${
                  dragOverIdx === colIdx && dragColIdx !== null && dragColIdx !== colIdx
                    ? 'border-l-2 border-l-indigo-500'
                    : ''
                } ${dragColIdx === colIdx ? 'opacity-30' : ''}`}
                style={{ width: getColWidth(col) }}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverIdx(colIdx) }}
                onDragLeave={() => setDragOverIdx(null)}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragColIdx !== null && dragColIdx !== colIdx) {
                    reorderColumns(activeSheetIndex, dragColIdx, colIdx)
                  }
                  setDragColIdx(null)
                  setDragOverIdx(null)
                }}
              >
                <div className="flex items-center gap-1.5 px-3 py-2">
                  <div
                    draggable
                    onDragStart={(e) => {
                      setDragColIdx(colIdx)
                      e.dataTransfer.effectAllowed = 'move'
                      e.dataTransfer.setData('text/plain', String(colIdx))
                    }}
                    onDragEnd={() => { setDragColIdx(null); setDragOverIdx(null) }}
                    className="shrink-0 cursor-grab active:cursor-grabbing p-0.5 -ml-1 rounded hover:bg-white/10 transition-colors"
                  >
                    <GripVertical className="w-3.5 h-3.5 text-white/25 hover:text-white/60" />
                  </div>
                  {col.isPrimary && (
                    <span title="Champ principal"><Key className="w-3 h-3 text-amber-400 shrink-0" /></span>
                  )}
                  {renamingCol === col.key ? (
                    <input
                      ref={renameInputRef}
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename()
                        if (e.key === 'Escape') setRenamingCol(null)
                      }}
                      className="text-[11px] font-bold text-white/80 uppercase tracking-wide flex-1 bg-white/10 border border-indigo-500/50 rounded px-1.5 py-0.5 outline-none"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span
                      className="text-[11px] font-bold text-white/60 uppercase tracking-wide truncate flex-1 cursor-pointer"
                      onClick={() => handleSort(col.key)}
                      onDoubleClick={(e) => { e.stopPropagation(); startRename(col.key) }}
                    >
                      {col.label}
                    </span>
                  )}
                  {col.fieldType === 'formula' && (
                    <button
                      onClick={() => setEditingFormula(col.key)}
                      className="shrink-0 px-1.5 py-0.5 rounded bg-indigo-500/20 text-[10px] font-mono font-bold text-indigo-400 hover:bg-indigo-500/30 transition-colors"
                      title="Modifier la formule"
                    >
                      fx
                    </button>
                  )}
                  <button
                    className="shrink-0 p-0.5 rounded hover:bg-white/10 transition-colors"
                    onClick={() => handleSort(col.key)}
                  >
                    {sortColKey === col.key && sortDir === 'asc' ? (
                      <ArrowUp className="w-3.5 h-3.5 text-indigo-400" />
                    ) : sortColKey === col.key && sortDir === 'desc' ? (
                      <ArrowDown className="w-3.5 h-3.5 text-indigo-400" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-white/20 group-hover/col:text-white/40 transition-colors" />
                    )}
                  </button>
                  <span className="shrink-0">
                    <ColumnMenu
                      colKey={col.key}
                      colIndex={colIdx}
                      totalColumns={visibleColumns.length}
                      sortDir={sortColKey === col.key && (sortDir === 'asc' || sortDir === 'desc') ? sortDir : null}
                      onSort={(dir) => { setSortColKey(col.key); setSortDir(dir) }}
                      onClearSort={() => { setSortColKey(null); setSortDir(null) }}
                      onMoveLeft={() => moveColumn(activeSheetIndex, col.key, 'left')}
                      onMoveRight={() => moveColumn(activeSheetIndex, col.key, 'right')}
                      onMoveFirst={() => moveColumnTo(activeSheetIndex, col.key, 'first')}
                      onMoveLast={() => moveColumnTo(activeSheetIndex, col.key, 'last')}
                      onHide={() => hideColumn(activeSheetIndex, col.key)}
                      onRename={() => startRename(col.key)}
                    />
                  </span>
                </div>
                {/* Resize handle */}
                <div
                  className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-indigo-500/40 transition-colors z-20"
                  onMouseDown={(e) => handleResizeStart(e, col.key, col.width)}
                />
              </th>
            ))}
            <th className="sticky top-0 z-20 w-10 bg-[#141414] border-b-2 border-white/[0.08] align-middle">
              <AddColumnMenu onAdd={handleAddColumn} />
            </th>
            <th className="sticky top-0 right-0 z-30 w-10 bg-[#141414] border-b-2 border-l border-white/[0.08]" />
          </tr>

          {/* Row 2: Type + Stats — sticky below row 1 (top ~37px) */}
          <tr>
            <th className="sticky top-[37px] left-0 z-30 w-10 bg-[#111111] border-b border-r border-white/[0.06]" />
            {visibleColumns.map((col, vColIdx) => (
              <th
                key={col.key}
                className={`sticky top-[37px] z-20 bg-[#111111] border-b border-r border-white/[0.06] text-left ${dragColIdx !== null && dragColIdx === vColIdx ? 'opacity-30' : ''}`}
                style={{ width: getColWidth(col) }}
              >
                <div className="flex flex-col gap-1 px-3 py-1.5">
                  <FieldTypeSelector
                    value={col.fieldType}
                    onChange={(type: FieldTypeId) => {
                      updateColumnType(activeSheetIndex, col.key, type)
                      if (type === 'formula') setEditingFormula(col.key)
                    }}
                    onSetPrimary={() => setColumnPrimary(activeSheetIndex, col.key)}
                    showPrimary={!col.isPrimary}
                    decimals={col.decimals}
                    onDecimalsChange={(d) => updateColumnDecimals(activeSheetIndex, col.key, d)}
                  />
                  {col.stats && (
                    <StatsBadges
                      stats={col.stats}
                      fieldType={col.fieldType}
                      onSortAsc={() => { setSortColKey(col.key); setSortDir('asc') }}
                      onSortDesc={() => { setSortColKey(col.key); setSortDir('desc') }}
                      onClearSort={() => { setSortColKey(null); setSortDir(null) }}
                      onSortByColor={() => { setSortColKey(col.key); setSortDir('color') }}
                    />
                  )}
                </div>
              </th>
            ))}
            <th className="sticky top-[37px] z-20 w-10 bg-[#111111] border-b border-white/[0.06]" />
            <th className="sticky top-[37px] right-0 z-30 w-10 bg-[#111111] border-b border-l border-white/[0.06]" />
          </tr>
        </thead>

        {/* Body */}
        <tbody>
          {taxoCols.length > 0 && groupByTaxonomy ? (
            <GroupedRows
              items={groupedData}
              visibleColumns={visibleColumns}
              sheet={sheet}
              collapsedGroups={collapsedGroups}
              toggleGroup={toggleGroup}
              editingCell={editingCell}
              editValue={editValue}
              setEditValue={setEditValue}
              inputRef={inputRef}
              startEdit={startEdit}
              commitEdit={commitEdit}
              setEditingCell={setEditingCell}
              setSheetRowId={setSheetRowId}
              deleteRow={deleteRow}
              activeSheetIndex={activeSheetIndex}
              formatCell={formatCell}
              getCellColorStyle={getCellColorStyle}
              dragColIdx={dragColIdx}
              rowCounter={{ current: 0 }}
              dropGroupKey={dropGroupKey}
              setDropGroupKey={setDropGroupKey}
              onDropOnGroup={handleDropOnGroup}
            />
          ) : (
            sortedRows.map((row, rowIdx) => (
              <DataRow
                key={row._id}
                row={row}
                rowIdx={rowIdx}
                visibleColumns={visibleColumns}
                sheet={sheet}
                editingCell={editingCell}
                editValue={editValue}
                setEditValue={setEditValue}
                inputRef={inputRef}
                startEdit={startEdit}
                commitEdit={commitEdit}
                setEditingCell={setEditingCell}
                setSheetRowId={setSheetRowId}
                deleteRow={deleteRow}
                activeSheetIndex={activeSheetIndex}
                formatCell={formatCell}
                getCellColorStyle={getCellColorStyle}
                dragColIdx={dragColIdx}
              />
            ))
          )}
        </tbody>
      </table>

      {/* Add row button */}
      <button
        onClick={handleAddRow}
        className="w-full flex items-center gap-2 px-4 py-2 text-xs text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors border-b border-white/5"
      >
        <Plus className="w-3.5 h-3.5" />
        Ajouter une ligne
      </button>

      {filteredRows.length === 0 && sheet.rows.length > 0 && (
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-white/30">Aucun resultat pour "{searchQuery}"</p>
        </div>
      )}

      {/* Formula Editor Modal */}
      {editingFormula && (() => {
        const col = sheet.columns.find((c) => c.key === editingFormula)
        if (!col) return null
        return (
          <FormulaEditor
            columnKey={editingFormula}
            currentFormula={col.formula || ''}
            columnLabel={col.label}
            currentResultType={col.formulaResultType ?? 'auto'}
            currentDecimals={col.formulaDecimals ?? 0}
            columns={sheet.columns}
            rows={sheet.rows}
            onSave={(formula, label, resultType, decimals) => {
              updateColumnFormula(activeSheetIndex, editingFormula, formula)
              updateColumnLabel(activeSheetIndex, editingFormula, label)
              // Store resultType and decimals on the column
              const s = useExcelStore.getState()
              const sheets = [...s.sheets]
              const sh = { ...sheets[activeSheetIndex] }
              sh.columns = sh.columns.map((c) =>
                c.key === editingFormula ? { ...c, formulaResultType: resultType, formulaDecimals: decimals } : c,
              )
              sheets[activeSheetIndex] = sh
              useExcelStore.setState({ sheets })
              setEditingFormula(null)
            }}
            onClose={() => setEditingFormula(null)}
          />
        )
      })()}
    </div>
  )
}

const IMAGE_EXTS = /\.(jpe?g|png|webp|gif|avif|svg)(\?.*)?$/i

function isImageValue(value: CellValue, col: ExcelColumn): boolean {
  if (!value || typeof value !== 'string') return false
  if (col.fieldType === 'image') return true
  return value.startsWith('http') && IMAGE_EXTS.test(value)
}

function getNumericValue(value: CellValue): number | null {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const cleaned = value.replace(/[€$%\s]/g, '').replace(/\./g, '').replace(',', '.')
    const num = parseFloat(cleaned)
    if (!isNaN(num)) return num
  }
  return null
}

interface RowGroup {
  key: string
  value: string
  level: number
  color: string
  colLabel: string
  colKey: string
  /** Chaîne ancêtres → ce groupe (inclus) pour classer un produit déposé. */
  path: { colKey: string; value: string; level: number }[]
  count: number
  children: (RowGroup | ExcelRow)[]
}

function isRowGroup(item: RowGroup | ExcelRow): item is RowGroup {
  return 'key' in item && 'children' in item && 'level' in item
}

interface DataRowProps {
  row: ExcelRow
  rowIdx: number
  visibleColumns: ExcelColumn[]
  sheet: { columns: ExcelColumn[] }
  editingCell: { rowId: string; colKey: string } | null
  editValue: string
  setEditValue: (v: string) => void
  inputRef: RefObject<HTMLInputElement | null>
  startEdit: (rowId: string, colKey: string, value: CellValue) => void
  commitEdit: () => void
  setEditingCell: (v: null) => void
  setSheetRowId: (id: string) => void
  deleteRow: (sheetIdx: number, rowId: string) => void
  activeSheetIndex: number
  formatCell: (value: CellValue, col: ExcelColumn) => string
  getCellColorStyle: (value: CellValue, col: ExcelColumn) => { bg: string; text: string } | null
  dragColIdx: number | null
}

function DataRow({
  row, rowIdx, visibleColumns, sheet, editingCell, editValue, setEditValue,
  inputRef, startEdit, commitEdit, setEditingCell, setSheetRowId, deleteRow,
  activeSheetIndex, formatCell, getCellColorStyle, dragColIdx,
}: DataRowProps) {
  const enriched = isRowEnriched(row)
  return (
    <tr
      className={`group transition-colors hover:bg-white/[0.07] cursor-pointer ${rowIdx % 2 === 1 ? 'bg-white/[0.025]' : ''}`}
    >
      <td
        className={`sticky left-0 z-10 relative px-1 py-[7px] border-b border-r border-white/[0.05] text-center align-middle ${rowIdx % 2 === 1 ? 'bg-[#141414]' : 'bg-[#0f0f0f]'} group-hover:bg-[#1a1a1a] cursor-grab active:cursor-grabbing`}
        onClick={() => setSheetRowId(row._id)}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('application/x-product-row', row._id)
          e.dataTransfer.setData('text/plain', row._id)
        }}
        title="Glisser vers un nœud de la taxonomie pour classer ce produit"
      >
        {/* Accent gauche indigo si ligne enrichie par l'IA */}
        {enriched && (
          <span
            className="absolute left-0 top-0 bottom-0 w-[2px] bg-gradient-to-b from-indigo-400/70 via-fuchsia-400/50 to-indigo-400/70"
            aria-hidden
          />
        )}
        <div className="flex items-center justify-center gap-0.5">
          {enriched ? (
            <span
              className="group-hover:hidden inline-flex items-center justify-center"
              title="Ce produit a été enrichi par l'IA"
            >
              <Sparkles className="w-3 h-3 text-indigo-400/90" />
            </span>
          ) : (
            <span className="text-[10px] text-white/15 group-hover:hidden tabular-nums">{rowIdx + 1}</span>
          )}
          <Expand className="w-3 h-3 text-white/20 group-hover:text-indigo-400 hidden group-hover:block transition-colors" />
        </div>
      </td>

      {visibleColumns.map((col, vColIdx) => {
        const isFormulaCol = col.fieldType === 'formula' && col.formula
        const value = isFormulaCol
          ? evaluateFormula(col.formula!, row, sheet.columns)
          : row[col.key]
        const isEditing = editingCell?.rowId === row._id && editingCell?.colKey === col.key && !isFormulaCol
        const colorStyle = getCellColorStyle(value, col)

        return (
          <td
            key={col.key}
            className={`px-3 py-[7px] border-b border-r border-white/[0.05] overflow-hidden align-middle ${isFormulaCol ? 'cursor-default' : 'cursor-text'} ${dragColIdx !== null && dragColIdx === vColIdx ? 'opacity-30' : ''}`}
            onClick={(e) => {
              if (isEditing || isFormulaCol) return
              e.stopPropagation()
              startEdit(row._id, col.key, value)
            }}
            style={{ backgroundColor: colorStyle?.bg }}
          >
            {isEditing ? (
              <input
                ref={inputRef as React.LegacyRef<HTMLInputElement>}
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEdit()
                  if (e.key === 'Escape') setEditingCell(null)
                }}
                className="w-full bg-indigo-500/10 border border-indigo-500/30 rounded px-2 py-1 text-[13px] text-white outline-none"
              />
            ) : isImageValue(value, col) ? (
              <div className="flex items-center gap-1.5 py-0.5">
                <img
                  src={String(value)}
                  alt=""
                  className="h-9 w-9 rounded object-cover shrink-0 bg-white/5 border border-white/10"
                  loading="lazy"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
                <span className="text-[10px] text-white/25 truncate">{String(value).split('/').pop()}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <span
                  className={`leading-snug truncate ${
                    col.fieldType === 'checkbox'
                      ? value ? 'text-emerald-400 text-[13px]' : 'text-white/20 text-[13px]'
                      : col.isPrimary
                        ? 'text-[13px] font-semibold'
                        : numericTypes.includes(col.fieldType)
                          ? 'text-[13px] tabular-nums font-medium'
                          : 'text-[12px]'
                  }`}
                  style={{ color: colorStyle?.text ?? (col.isPrimary ? 'rgba(255,255,255,0.95)' : numericTypes.includes(col.fieldType) ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.50)') }}
                >
                  {formatCell(value, col)}
                </span>
              </div>
            )}
          </td>
        )
      })}

      <td
        className={`sticky right-0 z-10 px-1 py-1.5 border-b border-l border-white/[0.05] text-center ${rowIdx % 2 === 1 ? 'bg-[#141414]' : 'bg-[#0f0f0f]'} group-hover:bg-[#1a1a1a]`}
      >
        <button
          onClick={(e) => { e.stopPropagation(); deleteRow(activeSheetIndex, row._id) }}
          className="p-1 text-white/30 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
          title="Supprimer la ligne"
          aria-label="Supprimer la ligne"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  )
}

/** Styles visuels hiérarchisés par niveau de taxonomie */
function getGroupLevelStyles(level: number) {
  switch (level) {
    case 1: return {
      py: 'py-3',
      bgOpacity: '12',
      hoverBg: 'hover:bg-white/[0.06]',
      borderClass: 'border-b-2 border-white/[0.10]',
      chevronSize: 'w-4.5 h-4.5',
      dotSize: 'w-2.5 h-2.5',
      labelSize: 'text-[10px]',
      valueSize: 'text-[15px]',
      valueWeight: 'font-bold',
      countSize: 'text-[11px]',
    }
    case 2: return {
      py: 'py-2.5',
      bgOpacity: '0a',
      hoverBg: 'hover:bg-white/[0.05]',
      borderClass: 'border-b border-white/[0.08]',
      chevronSize: 'w-4 h-4',
      dotSize: 'w-2 h-2',
      labelSize: 'text-[9px]',
      valueSize: 'text-[14px]',
      valueWeight: 'font-semibold',
      countSize: 'text-[10px]',
    }
    case 3: return {
      py: 'py-2',
      bgOpacity: '08',
      hoverBg: 'hover:bg-white/[0.04]',
      borderClass: 'border-b border-white/[0.06]',
      chevronSize: 'w-3.5 h-3.5',
      dotSize: 'w-1.5 h-1.5',
      labelSize: 'text-[9px]',
      valueSize: 'text-[13px]',
      valueWeight: 'font-medium',
      countSize: 'text-[10px]',
    }
    default: return {
      py: 'py-1.5',
      bgOpacity: '06',
      hoverBg: 'hover:bg-white/[0.03]',
      borderClass: 'border-b border-white/[0.05]',
      chevronSize: 'w-3 h-3',
      dotSize: 'w-1.5 h-1.5',
      labelSize: 'text-[8px]',
      valueSize: 'text-[12px]',
      valueWeight: 'font-medium',
      countSize: 'text-[9px]',
    }
  }
}

interface GroupedRowsProps extends Omit<DataRowProps, 'row' | 'rowIdx'> {
  items: (RowGroup | ExcelRow)[]
  collapsedGroups: Set<string>
  toggleGroup: (key: string) => void
  rowCounter: { current: number }
  dropGroupKey: string | null
  setDropGroupKey: (k: string | null) => void
  onDropOnGroup: (rowId: string, group: RowGroup) => void
}

function GroupedRows({ items, collapsedGroups, toggleGroup, rowCounter, dropGroupKey, setDropGroupKey, onDropOnGroup, ...rowProps }: GroupedRowsProps) {
  const totalCols = rowProps.visibleColumns.length + 2 // +2 for # col and action col

  return (
    <>
      {items.map((item) => {
        if (!isRowGroup(item)) {
          const idx = rowCounter.current++
          return (
            <DataRow
              key={item._id}
              row={item}
              rowIdx={idx}
              {...rowProps}
            />
          )
        }

        const isCollapsed = collapsedGroups.has(item.key)
        const indent = (item.level - 1) * 24
        const isDroppable = item.path.length > 0 // "(vide)" non-droppable
        const isDropTarget = dropGroupKey === item.key

        // Hiérarchie visuelle par niveau
        const levelStyles = getGroupLevelStyles(item.level)

        return (
          <Fragment key={item.key}>
            {/* Group header row */}
            <tr
              className={`cursor-pointer transition-colors ${levelStyles.hoverBg} ${isDropTarget ? 'ring-2 ring-inset ring-indigo-400' : ''}`}
              onClick={() => toggleGroup(item.key)}
              onDragOver={(e) => {
                if (!isDroppable) return
                if (!e.dataTransfer.types.includes('application/x-product-row')) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (dropGroupKey !== item.key) setDropGroupKey(item.key)
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return
                if (dropGroupKey === item.key) setDropGroupKey(null)
              }}
              onDrop={(e) => {
                const rowId = e.dataTransfer.getData('application/x-product-row')
                if (!rowId || !isDroppable) return
                e.preventDefault()
                setDropGroupKey(null)
                onDropOnGroup(rowId, item)
              }}
            >
              <td
                colSpan={totalCols}
                className={`${levelStyles.borderClass} p-0`}
                style={{
                  borderLeft: `3px solid ${item.color}${item.level <= 2 ? '' : '60'}`,
                  backgroundColor: isDropTarget
                    ? `${item.color}40`
                    : `${item.color}${levelStyles.bgOpacity}`,
                }}
              >
                <div
                  className={`sticky left-0 flex items-center ${levelStyles.py} pr-3 w-fit`}
                  style={{
                    paddingLeft: `${12 + indent}px`,
                  }}
                >
                  {isCollapsed ? (
                    <ChevronRight className={`${levelStyles.chevronSize} shrink-0 mr-2`} style={{ color: item.color }} />
                  ) : (
                    <ChevronDown className={`${levelStyles.chevronSize} shrink-0 mr-2`} style={{ color: item.color }} />
                  )}
                  <div
                    className={`${levelStyles.dotSize} rounded-sm shrink-0 mr-2`}
                    style={{ backgroundColor: item.color }}
                  />
                  <span className={`${levelStyles.valueSize} ${levelStyles.valueWeight}`} style={{ color: item.color }}>
                    {item.value}
                  </span>
                  <span className={`${levelStyles.countSize} text-white/30 tabular-nums ml-2 bg-white/[0.06] px-1.5 py-0.5 rounded-full`}>
                    {item.count}
                  </span>
                </div>
              </td>
            </tr>

            {/* Children (sub-groups or rows) */}
            {!isCollapsed && (
              <GroupedRows
                items={item.children}
                collapsedGroups={collapsedGroups}
                toggleGroup={toggleGroup}
                rowCounter={rowCounter}
                dropGroupKey={dropGroupKey}
                setDropGroupKey={setDropGroupKey}
                onDropOnGroup={onDropOnGroup}
                {...rowProps}
              />
            )}
          </Fragment>
        )
      })}
    </>
  )
}
