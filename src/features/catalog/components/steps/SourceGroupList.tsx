// src/features/catalog/components/steps/SourceGroupList.tsx
// Un groupe de sources connectables (projets PIM ou datasets Excel) dans le
// panneau gauche de l'étape Source du catalogue.
import { Loader2, Package } from 'lucide-react'

interface SourceListItem { id: string; label: string; sublabel?: string }

interface SourceGroupListProps {
  title: string
  items: SourceListItem[]
  emptyText: string
  loading: boolean
  connecting: boolean
  pendingId: string | null
  onSelect: (id: string) => void
}

export function SourceGroupList({ title, items, emptyText, loading, connecting, pendingId, onSelect }: SourceGroupListProps) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 text-indigo-400 animate-spin" /></div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">{emptyText}</p>
      ) : (
        items.map((item) => (
          <button key={item.id} disabled={connecting} onClick={() => onSelect(item.id)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md bg-surface-2 hover:bg-indigo-600/20 disabled:opacity-50 text-left transition-colors">
            {connecting && pendingId === item.id
              ? <Loader2 className="w-4 h-4 text-indigo-400 animate-spin shrink-0" />
              : <Package className="w-4 h-4 text-indigo-400 shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="text-sm text-white truncate">{item.label}</div>
              {item.sublabel && <div className="text-xs text-muted-foreground truncate">{item.sublabel}</div>}
            </div>
          </button>
        ))
      )}
    </div>
  )
}
