import { useState, useRef, useCallback, useMemo, Fragment, type RefObject, type MouseEvent as ReactMouseEvent } from 'react'
import { Plus, Trash2, GripVertical, Key, ArrowUp, ArrowDown, ArrowUpDown, ChevronRight, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { useExcelStore } from '@/stores/excel.store'
import { usePimStore } from '@/stores/pim.store'
import { recordAudit } from '@/lib/auditLog'
import { FieldTypeSelector } from './FieldTypeSelector'
import { StatsBadges } from './StatsBadges'
import { ColumnMenu } from './ColumnMenu'
import { AddColumnMenu } from './AddColumnMenu'
import { FormulaEditor } from './FormulaEditor'
import { cellValue } from './cellValue'
import { getTaxoColumns } from './taxonomyBuilder'
import { useTaxonomies } from '@/features/taxonomy/useTaxonomies'
import { GLOBAL_TAXO_FILTER_KEY, buildGlobalTaxoFilterPredicate } from '@/features/taxonomy/productTaxonomy'
import type { ExcelColumn, ExcelRow, CellValue, FieldTypeId } from './types'
import { useCan } from '@/features/access/useAccess'
import { useThemeStore } from '@/stores/theme.store'
import { rowCompleteness, completenessTone } from './completeness'
import { cellFreshness } from './fieldFreshness'
import { GalleryView } from './GalleryView'
import { DamImage } from '@/features/dam/DamImage'
import { DamPickButton } from '@/features/dam/DamPickButton'
import { isDriveImageRef } from '@/features/dam/driveAssets'
import { trashOrphanDamAssets } from '@/features/dam/damCleanup'
import { LayoutGrid, Table as TableIcon, MoveHorizontal } from 'lucide-react'

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
function isRowEnriched(row: ExcelRow): boolean {
  return AI_ENRICHMENT_KEYS.some((k) => {
    const v = row[k]
    return typeof v === 'string' ? v.trim().length > 0 : v != null
  })
}

export function DataTable() {
  // Heatmap des cellules numériques : texte foncé en mode clair (les teintes vives sont illisibles sur fond pâle).
  const isLight = useThemeStore((s) => s.resolvedTheme === 'light')
  const {
    sheets, activeSheetIndex, searchQuery, taxonomyNavFilter, groupByTaxonomy,
    updateColumnType, setColumnPrimary, updateCell, deleteRow, addRow,
    updateColumnWidth, moveColumn, moveColumnTo, hideColumn, updateColumnFormula, addColumn,
    updateColumnLabel, updateColumnDecimals, reorderColumns,
  } = useExcelStore()
  const selectedSourceIds = usePimStore((s) => s.selectedSourceIds)
  const { data: taxonomies } = useTaxonomies()
  const sheet = sheets[activeSheetIndex]
  /** Rows à afficher :
   *  - mono-source (une seule sheet) : on affiche tout.
   *  - multi-source avec sélection : rows des sources cochées dans SheetsColumn.
   *  - multi-source sans sélection :
   *      • avec filtre taxo actif → toutes les sources agrégées (le filtre
   *        restreint ensuite à la branche choisie) ;
   *      • sans filtre taxo → liste vide, l'utilisateur doit choisir un scope.
   *  Le schéma de colonnes vient toujours de la sheet active : les rows
   *  venues d'une autre source affichent simplement `null` pour les colonnes
   *  manquantes. */
  const hasNavFilter = Object.keys(taxonomyNavFilter).length > 0
  const baseRows = (() => {
    if (sheets.length <= 1) return sheet?.rows ?? []
    if (selectedSourceIds.length === 0) {
      return hasNavFilter ? sheets.flatMap((s) => s.rows) : []
    }
    return sheets
      .filter((s) => selectedSourceIds.includes(s.name))
      .flatMap((s) => s.rows)
  })()
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
  // Vue tableau ou galerie (cartes produit), persistée par navigateur.
  const [dataViewMode, setDataViewModeState] = useState<'table' | 'gallery'>(() =>
    localStorage.getItem('data.viewMode') === 'gallery' ? 'gallery' : 'table',
  )
  const setDataViewMode = (m: 'table' | 'gallery') => {
    localStorage.setItem('data.viewMode', m)
    setDataViewModeState(m)
  }

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

  // Filter rows by taxonomy navigation + search.
  // Sources et taxonomie agissent en INTERSECTION : on ne montre que les rows
  // qui matchent à la fois le scope source (cf. baseRows) ET le filtre taxo.
  const navFilterEntries = Object.entries(taxonomyNavFilter)
  let filteredRows = baseRows
  if (navFilterEntries.length > 0) {
    const colEntries = navFilterEntries.filter(([k]) => k !== GLOBAL_TAXO_FILTER_KEY)
    const globalFilter = taxonomyNavFilter[GLOBAL_TAXO_FILTER_KEY]
    const globalPredicate = globalFilter
      ? buildGlobalTaxoFilterPredicate(globalFilter, taxonomies)
      : null
    filteredRows = filteredRows.filter((row) => {
      if (!colEntries.every(([colKey, value]) => String(row[colKey]) === value)) return false
      if (globalPredicate && !globalPredicate(row)) return false
      return true
    })
  }
  if (searchQuery) {
    filteredRows = filteredRows.filter((row) =>
      sheet.columns.some((col) => {
        const v = row[col.key]
        return v !== null && String(v).toLowerCase().includes(searchQuery.toLowerCase())
      }),
    )
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

  /** Largeur idéale d'une colonne = max(entête, cellule la plus large), bornée. */
  const computeAutoFitWidth = (col: ExcelColumn): number => {
    // Police par type de cellule (cf. rendu : primaire/numérique 13px, texte 12px).
    const cellFont = col.isPrimary
      ? `600 13px ${AUTOFIT_FONT_FAMILY}`
      : numericTypes.includes(col.fieldType)
        ? `500 13px ${AUTOFIT_FONT_FAMILY}`
        : col.fieldType === 'image'
          ? `400 10px ${AUTOFIT_FONT_FAMILY}`
          : `400 12px ${AUTOFIT_FONT_FAMILY}`

    // Largeur d'entête : libellé (11px gras majuscules) + chrome (grip+tri+menu+fx+padding).
    const headerWidth = measureTextWidth(col.label.toUpperCase(), `700 11px ${AUTOFIT_FONT_FAMILY}`) + 118

    // Largeur de contenu : la plus large des cellules (échantillonnées si trop nombreuses).
    const rows = sheet.rows
    const stride = rows.length > AUTOFIT_SAMPLE ? Math.ceil(rows.length / AUTOFIT_SAMPLE) : 1
    let maxCell = 0
    for (let i = 0; i < rows.length; i += stride) {
      const text = formatCell(cellValue(col, rows[i], sheet.columns), col)
      if (!text) continue
      const w = measureTextWidth(text, cellFont)
      if (w > maxCell) maxCell = w
    }
    // Padding cellule px-3 (24) + pastille « récent »/gap (~16) ; image : + vignette 36 + gap.
    const cellWidth = maxCell > 0 ? maxCell + (col.fieldType === 'image' ? 24 + 44 : 24 + 16) : 0

    return Math.round(Math.min(AUTOFIT_MAX, Math.max(AUTOFIT_MIN, headerWidth, cellWidth)))
  }

  /** Double-clic sur la bordure : ajuste une colonne au contenu, façon Excel. */
  const handleAutoFitColumn = (colKey: string) => {
    const col = sheet.columns.find((c) => c.key === colKey)
    if (!col) return
    updateColumnWidth(activeSheetIndex, colKey, computeAutoFitWidth(col))
  }

  /** Bouton entête : ajuste TOUTES les colonnes visibles au contenu. */
  const handleAutoFitAllColumns = () => {
    for (const col of visibleColumns) updateColumnWidth(activeSheetIndex, col.key, computeAutoFitWidth(col))
  }

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

    const beforeRow = sheet.rows.find((r) => r._id === editingCell.rowId)
    const before = beforeRow ? beforeRow[editingCell.colKey] : undefined
    updateCell(activeSheetIndex, editingCell.rowId, editingCell.colKey, finalValue)
    if (String(before ?? '') !== String(finalValue ?? '')) {
      recordAudit({ action: 'data.cell.edit', module: 'data', targetLabel: col?.label ?? editingCell.colKey, meta: { before: String(before ?? '—'), after: String(finalValue ?? '—') } })
    }
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
    // Formula « pourcentage » : la valeur reçue est déjà ×100 (cf. cellValue), on suffixe « % »
    if (col.fieldType === 'formula' && col.formulaResultType === 'percent') {
      const num = getNumericValue(value)
      if (num !== null) {
        const d = col.formulaDecimals ?? 0
        return `${num.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d })} %`
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
      return { bg: `rgba(59,130,246,${intensity.toFixed(2)})`, text: isLight ? '#1d4ed8' : '#60a5fa' }
    }
    if (ratio >= 0.67) {
      // Tiers supérieur → vert, intensité croissante vers le max
      const intensity = 0.06 + ((ratio - 0.67) / 0.33) * 0.10
      return { bg: `rgba(34,197,94,${intensity.toFixed(2)})`, text: isLight ? '#15803d' : '#4ade80' }
    }

    // Tiers central → jaune subtil
    return { bg: 'rgba(234,179,8,0.07)', text: isLight ? '#a16207' : '#facc15' }
  }

  return (
    <div className="flex-1 overflow-auto">
      {/* Bascule tableau / galerie (cartes produit) */}
      <div className="sticky left-0 flex justify-end items-center gap-1.5 px-2 pt-1.5">
        {dataViewMode === 'table' && (
          <button
            onClick={handleAutoFitAllColumns}
            className="flex items-center gap-1 p-1 px-1.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-neutral-500 hover:text-white transition-colors"
            title="Ajuster toutes les colonnes au contenu"
          >
            <MoveHorizontal className="w-3.5 h-3.5" />
          </button>
        )}
        <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-white/[0.04] border border-white/[0.06]">
          <button
            onClick={() => setDataViewMode('table')}
            className={`p-1 rounded transition-colors ${dataViewMode === 'table' ? 'bg-white/[0.08] text-white' : 'text-neutral-500 hover:text-white'}`}
            aria-pressed={dataViewMode === 'table'}
            title="Vue tableau"
          >
            <TableIcon className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setDataViewMode('gallery')}
            className={`p-1 rounded transition-colors ${dataViewMode === 'gallery' ? 'bg-white/[0.08] text-white' : 'text-neutral-500 hover:text-white'}`}
            aria-pressed={dataViewMode === 'gallery'}
            title="Vue galerie (cartes produit)"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {dataViewMode === 'gallery' ? (
        <GalleryView rows={sortedRows} columns={visibleColumns} onOpen={setSheetRowId} />
      ) : (
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
            <th className="sticky top-0 left-0 z-30 w-10 bg-surface-2 border-b-2 border-r border-white/[0.08] align-middle">
              <AddColumnMenu onAdd={(type, label) => handleAddColumn(type, label, 'start')} />
            </th>
            {visibleColumns.map((col, colIdx) => (
              <th
                key={col.key}
                className={`sticky top-0 z-20 bg-surface-2 border-b-2 border-r border-white/[0.08] text-left relative group/col transition-all ${
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
                      className={`text-[11px] font-bold ${isLight ? 'text-white/80' : 'text-white/60'} uppercase tracking-wide truncate flex-1 cursor-pointer`}
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
                {/* Resize handle — double-clic = ajuster au contenu (façon Excel) */}
                <div
                  className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-indigo-500/40 transition-colors z-20"
                  title="Glisser pour redimensionner — double-clic pour ajuster au contenu"
                  onMouseDown={(e) => handleResizeStart(e, col.key, col.width)}
                  onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); handleAutoFitColumn(col.key) }}
                />
              </th>
            ))}
            <th className="sticky top-0 z-20 w-10 bg-surface-2 border-b-2 border-white/[0.08] align-middle">
              <AddColumnMenu onAdd={handleAddColumn} />
            </th>
            <th className="sticky top-0 right-0 z-30 w-10 bg-surface-2 border-b-2 border-l border-white/[0.08]" />
          </tr>

          {/* Row 2: Type + Stats — sticky below row 1 (top ~37px) */}
          <tr>
            <th className="sticky top-[37px] left-0 z-30 w-10 bg-surface-2 border-b border-r border-white/[0.06]" />
            {visibleColumns.map((col, vColIdx) => (
              <th
                key={col.key}
                className={`sticky top-[37px] z-20 bg-surface-2 border-b border-r border-white/[0.06] text-left ${dragColIdx !== null && dragColIdx === vColIdx ? 'opacity-30' : ''}`}
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
            <th className="sticky top-[37px] z-20 w-10 bg-surface-2 border-b border-white/[0.06]" />
            <th className="sticky top-[37px] right-0 z-30 w-10 bg-surface-2 border-b border-l border-white/[0.06]" />
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
              updateCell={updateCell}
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
                updateCell={updateCell}
                activeSheetIndex={activeSheetIndex}
                formatCell={formatCell}
                getCellColorStyle={getCellColorStyle}
                dragColIdx={dragColIdx}
              />
            ))
          )}
        </tbody>
      </table>
      )}

      {/* Add row button */}
      {dataViewMode === 'table' && (
      <button
        onClick={handleAddRow}
        className="w-full flex items-center gap-2 px-4 py-2 text-xs text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors border-b border-white/5"
      >
        <Plus className="w-3.5 h-3.5" />
        Ajouter une ligne
      </button>
      )}

      {/* Barre d'état : volume + complétude moyenne des lignes affichées */}
      {filteredRows.length > 0 && (() => {
        const avg = Math.round(
          filteredRows.reduce((acc, r) => acc + rowCompleteness(r, visibleColumns).pct, 0) /
            filteredRows.length,
        )
        const avgTone = completenessTone(avg)
        const dotCls =
          avgTone === 'emerald' ? 'bg-emerald-400/80' : avgTone === 'amber' ? 'bg-amber-400/80' : 'bg-red-400/80'
        return (
          <div className="flex items-center gap-2 px-4 py-1.5 text-[10px] text-white/30 border-b border-white/5">
            <span>{filteredRows.length} ligne{filteredRows.length > 1 ? 's' : ''}</span>
            <span className="text-white/15">·</span>
            <span className={`w-1.5 h-1.5 rounded-full ${dotCls}`} aria-hidden />
            <span>complétude moyenne {avg} %</span>
          </div>
        )
      })()}

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

// --- Auto-ajustement de largeur (double-clic sur la bordure, façon Excel) ---------

const AUTOFIT_FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
const AUTOFIT_MIN = 80
const AUTOFIT_MAX = 720 // borne haute pour qu'une cellule très longue ne crée pas une colonne géante
const AUTOFIT_SAMPLE = 3000 // au-delà, on échantillonne pour rester fluide

let autofitCanvas: HTMLCanvasElement | null = null
function measureTextWidth(text: string, font: string): number {
  if (!autofitCanvas) autofitCanvas = document.createElement('canvas')
  const ctx = autofitCanvas.getContext('2d')
  if (!ctx) return text.length * 7 // repli grossier si pas de canvas (tests/SSR)
  ctx.font = font
  return ctx.measureText(text).width
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
  updateCell: (sheetIdx: number, rowId: string, colKey: string, value: CellValue) => void
  activeSheetIndex: number
  formatCell: (value: CellValue, col: ExcelColumn) => string
  getCellColorStyle: (value: CellValue, col: ExcelColumn) => { bg: string; text: string } | null
  dragColIdx: number | null
}

function DataRow({
  row, rowIdx, visibleColumns, sheet, editingCell, editValue, setEditValue,
  inputRef, startEdit, commitEdit, setEditingCell, setSheetRowId, deleteRow,
  updateCell, activeSheetIndex, formatCell, getCellColorStyle, dragColIdx,
}: DataRowProps) {
  const canDelete = useCan('pim.delete')
  const enriched = isRowEnriched(row)
  // Score de complétude sur les colonnes visibles (pastille + tooltip des manquants).
  const completeness = rowCompleteness(row, visibleColumns)
  // Référence temporelle unique par rendu de ligne (pastilles de fraîcheur).
  const nowMs = Date.now()
  const tone = completenessTone(completeness.pct)
  const toneCls =
    tone === 'emerald' ? 'bg-emerald-400/80' : tone === 'amber' ? 'bg-amber-400/80' : 'bg-red-400/80'
  const completenessTitle =
    completeness.missing.length === 0
      ? `Complétude : 100 %`
      : `Complétude : ${completeness.pct} % (${completeness.filled}/${completeness.total})\nManquants : ${completeness.missing.slice(0, 8).join(', ')}${completeness.missing.length > 8 ? '…' : ''}`
  // Différencie simple-clic (ouvre la fiche) et double-clic (édite la cellule)
  // via un délai court : si un dblclick arrive avant l'expiration, on annule.
  const openTimerRef = useRef<number | null>(null)

  const handleRowClick = () => {
    if (editingCell?.rowId === row._id) return
    if (openTimerRef.current !== null) clearTimeout(openTimerRef.current)
    openTimerRef.current = window.setTimeout(() => {
      setSheetRowId(row._id)
      openTimerRef.current = null
    }, 200)
  }

  const cancelOpen = () => {
    if (openTimerRef.current !== null) {
      clearTimeout(openTimerRef.current)
      openTimerRef.current = null
    }
  }

  return (
    <tr
      onClick={handleRowClick}
      className={`group transition-colors hover:bg-white/[0.07] cursor-pointer ${rowIdx % 2 === 1 ? 'bg-white/[0.025]' : ''}`}
    >
      <td
        className={`sticky left-0 z-10 relative px-1 py-[7px] border-b border-r border-white/[0.05] text-center align-middle ${rowIdx % 2 === 1 ? 'bg-surface-2' : 'bg-background'} group-hover:bg-surface cursor-grab active:cursor-grabbing`}
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
        <div className="flex items-center justify-center gap-1">
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${toneCls}`}
            title={completenessTitle}
            aria-label={`Complétude ${completeness.pct} %`}
          />
          <span className="text-[10px] text-white/15 tabular-nums">{rowIdx + 1}</span>
        </div>
      </td>

      {visibleColumns.map((col, vColIdx) => {
        const isFormulaCol = col.fieldType === 'formula' && col.formula
        const value = cellValue(col, row, sheet.columns)
        const isEditing = editingCell?.rowId === row._id && editingCell?.colKey === col.key && !isFormulaCol
        const colorStyle = getCellColorStyle(value, col)
        // Fraîcheur par champ (produits PIM) : pastille ambre ≥ 30 j, rouge ≥ 90 j.
        const fresh = cellFreshness(row, col.key, nowMs)
        const freshDot = fresh && !isEditing ? (
          <span
            title={`Champ mis à jour il y a ${fresh.ageDays} j`}
            className={`shrink-0 w-1.5 h-1.5 rounded-full ${fresh.tone === 'red' ? 'bg-red-400/80' : 'bg-amber-400/80'}`}
          />
        ) : null

        return (
          <td
            key={col.key}
            className={`px-3 py-[7px] border-b border-r border-white/[0.05] overflow-hidden align-middle ${isFormulaCol ? 'cursor-default' : 'cursor-pointer'} ${dragColIdx !== null && dragColIdx === vColIdx ? 'opacity-30' : ''}`}
            onDoubleClick={(e) => {
              if (isEditing || isFormulaCol) return
              e.stopPropagation()
              cancelOpen()
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
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEdit()
                  if (e.key === 'Escape') setEditingCell(null)
                }}
                className="w-full bg-indigo-500/10 border border-indigo-500/30 rounded px-2 py-1 text-[13px] text-white outline-none"
              />
            ) : col.fieldType === 'image' || col.fieldType === 'url' || isImageValue(value, col) ? (
              <div className="flex items-center gap-1.5 py-0.5 min-w-0">
                {value && (isDriveImageRef(String(value)) || isImageValue(value, col)) ? (
                  <DamImage
                    value={String(value)}
                    className="h-9 w-9 rounded object-cover shrink-0 bg-white/5 border border-white/10"
                  />
                ) : null}
                <span className="text-[11px] text-white/35 truncate min-w-0">
                  {!value
                    ? ''
                    : isDriveImageRef(String(value))
                      ? 'DAM (Drive)'
                      : col.fieldType === 'image'
                        ? String(value).split('/').pop()
                        : String(value)}
                </span>
                {(col.fieldType === 'image' || col.fieldType === 'url') && (
                  <DamPickButton
                    onPick={(link) => updateCell(activeSheetIndex, row._id, col.key, link)}
                  />
                )}
                {freshDot}
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                {freshDot}
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
                  style={{ color: colorStyle?.text ?? (col.isPrimary ? 'rgb(var(--base) / 0.95)' : numericTypes.includes(col.fieldType) ? 'rgb(var(--base) / 0.75)' : 'rgb(var(--base) / 0.50)') }}
                >
                  {formatCell(value, col)}
                </span>
              </div>
            )}
          </td>
        )
      })}

      <td
        className={`sticky right-0 z-10 px-1 py-1.5 border-b border-l border-white/[0.05] text-center ${rowIdx % 2 === 1 ? 'bg-surface-2' : 'bg-background'} group-hover:bg-surface`}
        onClick={(e) => e.stopPropagation()}
      >
        {canDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              // Cleanup DAM : corbeille Drive des images du produit non utilisées ailleurs.
              const st = useExcelStore.getState()
              const sh = st.sheets[activeSheetIndex]
              if (sh) {
                const others = sh.rows.filter((r) => r._id !== row._id)
                void trashOrphanDamAssets(row, sh.columns, others)
                  .then((n) => {
                    if (n > 0) toast.success(`${n} image(s) du DAM déplacée(s) dans la corbeille Drive`)
                    else toast.info('Aucune image DAM (lien Drive) dans ce produit — la cellule contient une URL externe, pas un asset Drive.')
                  })
                  .catch((e) => {
                    console.error('[DAM] suppression produit échouée', e)
                    toast.error(`DAM : suppression Drive échouée — ${e instanceof Error ? e.message : 'erreur'}`)
                  })
              }
              deleteRow(activeSheetIndex, row._id)
            }}
            className="p-1 text-white/30 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
            title="Supprimer la ligne"
            aria-label="Supprimer la ligne"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </td>
    </tr>
  )
}

/** Styles visuels hiérarchisés par niveau de taxonomie.
 *  En mode clair, les teintes de groupe sont plus soutenues : une couleur à ~5% sur fond
 *  blanc est un lavis invisible, alors qu'elle ressort sur fond sombre. */
function getGroupLevelStyles(level: number, isLight: boolean) {
  switch (level) {
    case 1: return {
      py: 'py-3',
      bgOpacity: isLight ? '26' : '12',
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
      bgOpacity: isLight ? '1c' : '0a',
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
      bgOpacity: isLight ? '16' : '08',
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
      bgOpacity: isLight ? '12' : '06',
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
  const isLight = useThemeStore((s) => s.resolvedTheme === 'light')

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
        const levelStyles = getGroupLevelStyles(item.level, isLight)

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
