import { ChevronRight } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface CollapsiblePanelProps {
  id: string
  title: string
  icon: React.ComponentType<{ className?: string }>
  collapsed: boolean
  onToggle: () => void
  children: React.ReactNode
}

export function CollapsiblePanel({ id, title, icon: Icon, collapsed, onToggle, children }: CollapsiblePanelProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style} className="border-b border-white/5">
      {/* Header — clickable to toggle, drag handle via listeners */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-white/50 uppercase tracking-wider hover:bg-white/5 transition-colors"
        {...attributes}
        {...listeners}
      >
        <Icon className="w-3.5 h-3.5" />
        <span className="flex-1 text-left">{title}</span>
        <ChevronRight className={`w-3 h-3 transition-transform ${collapsed ? '' : 'rotate-90'}`} />
      </button>

      {/* Content with collapse animation */}
      {!collapsed && (
        <div className="overflow-hidden">
          {children}
        </div>
      )}
    </div>
  )
}
