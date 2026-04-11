import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus, Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import type { ClientFormField, ClientFormFieldType } from '@/features/taxonomy/types'
import { FIELD_TYPE_REGISTRY, ALL_FIELD_TYPES, createEmptyField } from './fieldTypes'

interface Props {
  fields: ClientFormField[]
  selectedFieldId: string | null
  onSelect: (id: string) => void
  onReorder: (fields: ClientFormField[]) => void
  onAdd: (field: ClientFormField) => void
  onToggleHidden: (id: string) => void
}

export function FieldList({
  fields,
  selectedFieldId,
  onSelect,
  onReorder,
  onAdd,
  onToggleHidden,
}: Props) {
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const sorted = [...fields].sort((a, b) => a.order - b.order)

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIdx = sorted.findIndex((f) => f.id === active.id)
    const newIdx = sorted.findIndex((f) => f.id === over.id)
    const moved = arrayMove(sorted, oldIdx, newIdx).map((f, i) => ({
      ...f,
      order: i * 10,
    }))
    onReorder(moved)
  }

  const handleAdd = (type: ClientFormFieldType) => {
    const maxOrder = sorted.reduce((m, f) => Math.max(m, f.order), 0)
    onAdd(createEmptyField(type, maxOrder + 10))
    setAddMenuOpen(false)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sorted.map((f) => f.id)} strategy={verticalListSortingStrategy}>
            {sorted.map((field) => (
              <SortableRow
                key={field.id}
                field={field}
                selected={field.id === selectedFieldId}
                onSelect={() => onSelect(field.id)}
                onToggleHidden={() => onToggleHidden(field.id)}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
      <div className="relative border-t border-white/[0.06] p-2">
        <button
          onClick={() => setAddMenuOpen((o) => !o)}
          className="w-full flex items-center justify-center gap-1.5 text-[12px] text-white/60 hover:text-white hover:bg-white/[0.06] px-3 py-2 rounded-md transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Ajouter un champ
        </button>
        {addMenuOpen && (
          <div className="absolute bottom-full left-2 right-2 mb-1 bg-[#1a1a1a] border border-white/[0.08] rounded-md shadow-lg p-1 z-10">
            {ALL_FIELD_TYPES.map((t) => {
              const meta = FIELD_TYPE_REGISTRY[t]
              const Icon = meta.icon
              return (
                <button
                  key={t}
                  onClick={() => handleAdd(t)}
                  className="w-full flex items-center gap-2 text-[12px] text-white/70 hover:text-white hover:bg-white/[0.06] px-2 py-1.5 rounded transition-colors"
                >
                  <Icon className="w-3.5 h-3.5" />
                  {meta.label}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function SortableRow({
  field,
  selected,
  onSelect,
  onToggleHidden,
}: {
  field: ClientFormField
  selected: boolean
  onSelect: () => void
  onToggleHidden: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: field.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const Icon = FIELD_TYPE_REGISTRY[field.type].icon

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer mb-0.5 ${
        selected
          ? 'bg-indigo-500/15 ring-1 ring-indigo-500/40'
          : 'hover:bg-white/[0.04]'
      } ${field.hidden ? 'opacity-40' : ''}`}
    >
      <button
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="text-white/30 hover:text-white/60 cursor-grab active:cursor-grabbing"
        aria-label="Déplacer"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <Icon className="w-3.5 h-3.5 text-white/40" />
      <span className="flex-1 text-[12px] text-white/80 truncate">{field.label}</span>
      {field.required && <span className="text-red-400 text-[11px]">*</span>}
      {field.builtin && (
        <span className="text-[9px] uppercase text-indigo-400/70">built</span>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onToggleHidden()
        }}
        className="text-white/30 hover:text-white/80"
        aria-label={field.hidden ? 'Afficher' : 'Masquer'}
        title={field.hidden ? 'Afficher' : 'Masquer'}
      >
        {field.hidden ? (
          <EyeOff className="w-3.5 h-3.5" />
        ) : (
          <Eye className="w-3.5 h-3.5" />
        )}
      </button>
    </div>
  )
}
