import { useState } from 'react'
import { Eye, EyeOff, ChevronDown, ChevronRight, GripVertical } from 'lucide-react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useExcelStore } from '@/stores/excel.store'
import { FieldTypeIcon } from './FieldTypeIcon'
import type { ExcelColumn } from './types'

function FieldStats({ col }: { col: ExcelColumn }) {
  if (!col.stats) return null
  const { stats } = col
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 px-2.5 pb-2 text-[10px]">
      <span className="text-white/30">Uniques: <span className="text-white/50">{stats.unique}</span></span>
      <span className="text-white/30">Vides: <span className="text-white/50">{stats.empty}</span></span>
      {stats.min !== null && (
        <span className="text-blue-400/60">Min: <span className="text-blue-400/80">{stats.min}</span></span>
      )}
      {stats.max !== null && (
        <span className="text-emerald-400/60">Max: <span className="text-emerald-400/80">{stats.max}</span></span>
      )}
      {stats.avg !== null && (
        <span className="text-amber-400/60">Moy: <span className="text-amber-400/80">{stats.avg}</span></span>
      )}
    </div>
  )
}

interface SortableFieldProps {
  col: ExcelColumn
  isHidden: boolean
  isExpanded: boolean
  onToggleExpand: () => void
  onToggleVisibility: () => void
}

function SortableField({ col, isHidden, isExpanded, onToggleExpand, onToggleVisibility }: SortableFieldProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.key })
  const hasStats = !!col.stats

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border transition-colors ${
        isDragging
          ? 'bg-indigo-500/10 border-indigo-500/30 shadow-lg shadow-indigo-500/10'
          : isHidden
            ? 'bg-white/[0.02] border-white/5 opacity-50 hover:opacity-70'
            : 'bg-white/5 border-white/10 hover:border-white/15'
      }`}
    >
      <div className="flex items-center gap-1.5 px-1.5 py-2">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="shrink-0 cursor-grab active:cursor-grabbing text-white/15 hover:text-white/40 touch-none"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
        {/* Expand toggle */}
        <button
          onClick={onToggleExpand}
          className={`shrink-0 ${hasStats ? 'text-white/20 hover:text-white/50' : 'text-transparent pointer-events-none'}`}
        >
          {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>
        <FieldTypeIcon fieldType={col.fieldType} className="w-3.5 h-3.5 text-white/30 shrink-0" />
        <span className="text-xs text-white/70 flex-1 truncate">{col.label}</span>
        {col.isPrimary && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
            Clé
          </span>
        )}
        <button
          onClick={onToggleVisibility}
          className="shrink-0 p-0.5 rounded hover:bg-white/10 transition-colors"
        >
          {isHidden ? (
            <EyeOff className="w-3.5 h-3.5 text-white/20" />
          ) : (
            <Eye className="w-3.5 h-3.5 text-indigo-400" />
          )}
        </button>
      </div>
      {isExpanded && !isDragging && <FieldStats col={col} />}
    </div>
  )
}

export function FieldsPanel() {
  const { sheets, activeSheetIndex, toggleColumnVisibility, showAllColumns, hideAllColumns, reorderColumns } = useExcelStore()
  const sheet = sheets[activeSheetIndex]
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  if (!sheet) return null

  const hidden = new Set(sheet.hiddenColumns ?? [])
  const visibleCount = sheet.columns.length - hidden.size
  const columnIds = sheet.columns.map((c) => c.key)

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = columnIds.indexOf(active.id as string)
    const newIndex = columnIds.indexOf(over.id as string)
    if (oldIndex !== -1 && newIndex !== -1) {
      reorderColumns(activeSheetIndex, oldIndex, newIndex)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Header with summary stats */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white/80 flex items-center gap-2">
          <Eye className="w-4 h-4 text-indigo-400" />
          Champs
        </h3>
        <span className="text-[10px] text-white/30">
          {visibleCount}/{sheet.columns.length}
        </span>
      </div>

      {/* Global stats */}
      <div className="grid grid-cols-2 gap-1.5">
        <div className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5">
          <p className="text-[9px] text-white/30 uppercase tracking-wider">Lignes</p>
          <p className="text-xs text-white/70 font-medium">{sheet.rows.length}</p>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5">
          <p className="text-[9px] text-white/30 uppercase tracking-wider">Colonnes</p>
          <p className="text-xs text-white/70 font-medium">{sheet.columns.length}</p>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex gap-1.5">
        <button
          onClick={() => showAllColumns(activeSheetIndex)}
          className="flex-1 text-[10px] px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-white/50 hover:text-white/70 border border-white/10 transition-colors"
        >
          Tout afficher
        </button>
        <button
          onClick={() => hideAllColumns(activeSheetIndex)}
          className="flex-1 text-[10px] px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-white/50 hover:text-white/70 border border-white/10 transition-colors"
        >
          Tout masquer
        </button>
      </div>

      {/* Fields list with drag & drop */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={columnIds} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-1">
            {sheet.columns.map((col) => (
              <SortableField
                key={col.key}
                col={col}
                isHidden={hidden.has(col.key)}
                isExpanded={expandedKey === col.key}
                onToggleExpand={() => setExpandedKey(expandedKey === col.key ? null : (col.stats ? col.key : null))}
                onToggleVisibility={() => toggleColumnVisibility(activeSheetIndex, col.key)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}
