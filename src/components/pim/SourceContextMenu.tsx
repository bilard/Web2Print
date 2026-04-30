import { useEffect, useRef } from 'react'
import { Pencil, RefreshCw, FolderInput, Trash2 } from 'lucide-react'

interface Props {
  x: number
  y: number
  onRename: () => void
  onResync: () => void
  onMove: () => void
  onDelete: () => void
  onClose: () => void
}

export function SourceContextMenu({ x, y, onRename, onResync, onMove, onDelete, onClose }: Props) {
  const wrapper = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [onClose])

  const item = (Icon: typeof Pencil, label: string, fn: () => void, danger = false) => (
    <button
      onClick={() => { fn(); onClose() }}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-white/[0.06] ${danger ? 'text-red-300 hover:text-red-200' : 'text-white/70 hover:text-white'}`}
    >
      <Icon className="w-3.5 h-3.5 opacity-60" /> {label}
    </button>
  )

  return (
    <div
      ref={wrapper}
      style={{ left: x, top: y }}
      className="fixed z-30 min-w-[180px] bg-[#1a1a1a] border border-white/10 rounded-md shadow-xl py-1"
    >
      {item(Pencil, 'Renommer', onRename)}
      {item(RefreshCw, 'Mettre à jour (re-scrape)', onResync)}
      {item(FolderInput, 'Déplacer dans un groupe…', onMove)}
      <div className="my-1 h-px bg-white/10" />
      {item(Trash2, 'Supprimer la source', onDelete, true)}
    </div>
  )
}
