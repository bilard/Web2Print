import { Pencil, Copy, Trash2, Settings } from 'lucide-react'

interface TaxonomyContextMenuProps {
  onClose: () => void
  onRename: () => void
  onDuplicate: () => void
  onSettings: () => void
  onDelete: () => void
}

export function TaxonomyContextMenu({
  onClose,
  onRename,
  onDuplicate,
  onSettings,
  onDelete,
}: TaxonomyContextMenuProps) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-2 top-8 z-50 w-36 bg-[#1e1e1e] border border-white/10 rounded-lg shadow-xl overflow-hidden">
        <button
          onClick={(e) => { e.stopPropagation(); onRename() }}
          className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-white/60 hover:bg-white/[0.06] transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
          Renommer
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDuplicate() }}
          className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-white/60 hover:bg-white/[0.06] transition-colors"
        >
          <Copy className="w-3.5 h-3.5" />
          Dupliquer
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onSettings() }}
          className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-white/60 hover:bg-white/[0.06] transition-colors"
        >
          <Settings className="w-3.5 h-3.5" />
          Paramètres
        </button>
        <div className="h-px bg-white/[0.06] mx-2" />
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-red-400/70 hover:bg-red-500/10 hover:text-red-400 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Supprimer
        </button>
      </div>
    </>
  )
}
