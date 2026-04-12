import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Search } from 'lucide-react'
import { FIELD_TYPES, type FieldTypeId } from './types'
import { FieldTypeIcon } from './FieldTypeIcon'

interface Props {
  onAdd: (type: FieldTypeId, label: string) => void
}

export function AddColumnMenu({ onAdd }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPos({
        top: rect.bottom + 4,
        left: Math.min(rect.left, window.innerWidth - 280),
      })
    }
    setTimeout(() => inputRef.current?.focus(), 50)

    const handleClick = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
        setSearch('')
      }
    }
    const handleScroll = () => { setOpen(false); setSearch('') }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('scroll', handleScroll, true)
    }
  }, [open])

  const filtered = FIELD_TYPES.filter((t) =>
    t.label.toLowerCase().includes(search.toLowerCase()),
  )

  // Group by category
  const categories = [
    { key: 'text', label: 'Texte' },
    { key: 'number', label: 'Nombre' },
    { key: 'choice', label: 'Choix' },
    { key: 'date', label: 'Date' },
    { key: 'link', label: 'Lien' },
    { key: 'other', label: 'Autre' },
  ] as const

  const handleSelect = (ft: typeof FIELD_TYPES[number]) => {
    onAdd(ft.id, ft.shortLabel ?? ft.label)
    setOpen(false)
    setSearch('')
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className="w-full h-full flex items-center justify-center text-white/15 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors"
        title="Ajouter un champ"
      >
        <Plus className="w-4 h-4" />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          className="fixed w-64 bg-[#1e1e1e] border border-white/15 rounded-xl shadow-2xl z-[9999] overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          style={{ top: pos.top, left: pos.left }}
        >
          {/* Search */}
          <div className="px-3 py-2 border-b border-white/10">
            <div className="flex items-center gap-2 bg-white/5 rounded-lg px-2.5 py-1.5">
              <Search className="w-3.5 h-3.5 text-white/30" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Rechercher un type"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-transparent text-sm text-white/80 placeholder:text-white/30 outline-none flex-1"
              />
            </div>
          </div>

          {/* List grouped by category */}
          <div className="max-h-80 overflow-y-auto py-1">
            {search
              ? filtered.map((ft) => (
                  <TypeItem key={ft.id} ft={ft} onSelect={() => handleSelect(ft)} />
                ))
              : categories.map(({ key, label }) => {
                  const items = FIELD_TYPES.filter((t) => t.category === key)
                  if (items.length === 0) return null
                  return (
                    <div key={key}>
                      <div className="px-3 py-1.5 text-[10px] text-white/30 uppercase tracking-wider font-semibold">
                        {label}
                      </div>
                      {items.map((ft) => (
                        <TypeItem key={ft.id} ft={ft} onSelect={() => handleSelect(ft)} />
                      ))}
                    </div>
                  )
                })
            }
            {filtered.length === 0 && (
              <p className="text-xs text-white/30 text-center py-4">Aucun résultat</p>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

function TypeItem({ ft, onSelect }: { ft: typeof FIELD_TYPES[number]; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center gap-3 px-3 py-2 text-left text-white/70 hover:bg-white/5 hover:text-white/90 transition-colors"
    >
      <FieldTypeIcon type={ft.id} className="w-4 h-4 shrink-0 text-white/40" />
      <span className="text-sm">{ft.label}</span>
    </button>
  )
}
