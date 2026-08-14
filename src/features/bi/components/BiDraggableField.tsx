// Une ligne du volet « Champs » : elle se GLISSE dans une zone, ou se double-clique.
//
// ⚠⚠ Le double-clic reste indispensable : tout le monde ne glisse pas, et un module qui
// n'offrirait que le glisser laisserait sur le bord ceux qui n'y arrivent pas. Il vise la
// zone la plus probable (`bestWellFor`), exactement comme le geste.
//
// ⚠ La ligne ENTIÈRE est la poignée, sans grip dédié : c'est le geste attendu d'une liste de
// champs. Le seuil de 5 px de `BiBuilderDnd` est ce qui laisse passer le double-clic.
import type { ReactNode } from 'react'
import { useDraggable } from '@dnd-kit/core'
import type { DraggedField } from '../builder/wells'

export function BiDraggableField({ field, icon, disabled, onAdd }: {
  field: DraggedField
  icon: ReactNode
  disabled: boolean
  onAdd: () => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `field:${field.role}:${field.id}`, disabled,
    data: { kind: 'field', field },
  })

  return (
    <div
      ref={setNodeRef} {...attributes} {...listeners}
      onDoubleClick={disabled ? undefined : onAdd}
      title={field.label}
      className={`flex items-center gap-1.5 rounded-md px-1 py-1 text-[11.5px] transition-colors ${
        disabled ? 'text-white/40' : 'cursor-grab active:cursor-grabbing touch-none text-white/55 hover:bg-white/[0.06] hover:text-white/80'
      } ${isDragging ? 'opacity-40' : ''}`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{field.label}</span>
    </div>
  )
}
