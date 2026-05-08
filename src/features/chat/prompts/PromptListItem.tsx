import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal, Star, Pencil, Copy, Trash2 } from 'lucide-react'
import { CATEGORY_META, type Prompt } from './types'

interface PromptListItemProps {
  prompt: Prompt
  onUse: (p: Prompt) => void
  onToggleFavorite: (id: string) => void
  onEdit: (p: Prompt) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
}

export function PromptListItem({
  prompt,
  onUse,
  onToggleFavorite,
  onEdit,
  onDuplicate,
  onDelete,
}: PromptListItemProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const Icon = CATEGORY_META[prompt.category].icon

  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [menuOpen])

  return (
    <div className="group relative flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.04] transition-colors">
      <button
        type="button"
        onClick={() => onUse(prompt)}
        className="flex-1 min-w-0 flex items-start gap-3 text-left"
      >
        <div className="w-7 h-7 rounded-md bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0 mt-0.5">
          <Icon className="w-3.5 h-3.5 text-white/60" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[13.5px] text-white/90 truncate">{prompt.title}</span>
            {prompt.favorite && (
              <Star className="w-3 h-3 text-amber-300 fill-amber-300 shrink-0" />
            )}
          </div>
          <p className="mt-0.5 text-[12px] text-white/45 truncate">
            {prompt.content.slice(0, 110)}
          </p>
        </div>
      </button>

      <div className="relative shrink-0" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className={`w-7 h-7 flex items-center justify-center rounded-md transition-all ${
            menuOpen
              ? 'bg-white/[0.08] text-white opacity-100'
              : 'text-white/50 hover:text-white hover:bg-white/[0.06] opacity-0 group-hover:opacity-100'
          }`}
          aria-label="Options"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 w-52 bg-[#1c1c1c] border border-white/[0.1] rounded-xl shadow-2xl shadow-black/50 overflow-hidden py-1.5 z-50">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                onToggleFavorite(prompt.id)
              }}
              className="w-full flex items-center gap-3 px-3 py-2 text-[13px] text-white/85 hover:bg-white/[0.04] hover:text-white transition-colors"
            >
              <Star
                className={`w-4 h-4 shrink-0 ${
                  prompt.favorite ? 'text-amber-300 fill-amber-300' : 'text-white/60'
                }`}
              />
              <span>{prompt.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                onEdit(prompt)
              }}
              className="w-full flex items-center gap-3 px-3 py-2 text-[13px] text-white/85 hover:bg-white/[0.04] hover:text-white transition-colors"
            >
              <Pencil className="w-4 h-4 text-white/60 shrink-0" />
              <span>Renommer / éditer</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                onDuplicate(prompt.id)
              }}
              className="w-full flex items-center gap-3 px-3 py-2 text-[13px] text-white/85 hover:bg-white/[0.04] hover:text-white transition-colors"
            >
              <Copy className="w-4 h-4 text-white/60 shrink-0" />
              <span>Dupliquer</span>
            </button>
            <div className="my-1 border-t border-white/[0.06]" />
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                onDelete(prompt.id)
              }}
              className="w-full flex items-center gap-3 px-3 py-2 text-[13px] text-rose-300 hover:bg-rose-500/10 transition-colors"
            >
              <Trash2 className="w-4 h-4 shrink-0" />
              <span>Supprimer</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
