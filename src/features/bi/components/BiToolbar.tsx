// Sélecteur de tableau de bord + bascule de mode. ⚠ La bascule est EXPLICITE (bouton et
// touche « E ») : le mode consultation ne doit jamais laisser traîner une poignée.
import { Eye, Pencil, Undo2, Redo2 } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import type { Dashboard } from '../types'

interface BiToolbarProps {
  items: Dashboard[]
  currentId: string | null
  onSelect: (id: string) => void
  editing: boolean
  onToggleEdit: () => void
  canEdit: boolean
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}

export function BiToolbar({
  items, currentId, onSelect, editing, onToggleEdit, canEdit, undo, redo, canUndo, canRedo,
}: BiToolbarProps) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        value={currentId ?? ''}
        onChange={(e) => onSelect(e.target.value)}
        className="bg-well border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white"
      >
        {items.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>

      {canEdit && (
        <button
          onClick={onToggleEdit}
          title={t('bi.toolbar.toggleHint')}
          className={`inline-flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5 transition-colors ${
            editing ? 'bg-indigo-500 text-[#fff]' : 'bg-well text-white/70 hover:text-white'
          }`}
        >
          {editing ? <Pencil className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {editing ? t('bi.toolbar.editing') : t('bi.toolbar.viewing')}
        </button>
      )}

      {editing && (
        <div className="flex items-center gap-1">
          <button onClick={undo} disabled={!canUndo} title={t('bi.toolbar.undo')}
            className="p-1.5 rounded-lg bg-well text-white/60 hover:text-white disabled:opacity-30">
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={redo} disabled={!canRedo} title={t('bi.toolbar.redo')}
            className="p-1.5 rounded-lg bg-well text-white/60 hover:text-white disabled:opacity-30">
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
