import { useState, useRef, useEffect } from 'react'
import { Search } from 'lucide-react'
import { FIELD_TYPES, type FieldTypeId } from './types'
import { FieldTypeIcon } from './FieldTypeIcon'

const NUMERIC_TYPES: FieldTypeId[] = ['number', 'currency', 'percent', 'rating']

interface Props {
  value: FieldTypeId
  onChange: (type: FieldTypeId) => void
  onSetPrimary?: () => void
  showPrimary?: boolean
  decimals?: number
  onDecimalsChange?: (d: number) => void
}

export function FieldTypeSelector({ value, onChange, onSetPrimary, showPrimary, decimals, onDecimalsChange }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const current = FIELD_TYPES.find((t) => t.id === value)
  const filtered = FIELD_TYPES.filter((t) =>
    t.label.toLowerCase().includes(search.toLowerCase()),
  ).sort((a, b) => {
    if (a.id === value) return -1
    if (b.id === value) return 1
    return 0
  })
  const isNumeric = NUMERIC_TYPES.includes(value)

  return (
    <div ref={ref} className="relative flex items-center gap-1">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-white/10 transition-colors text-white/50 hover:text-white/80"
        title="Changer le type"
      >
        <FieldTypeIcon type={value} className="w-3.5 h-3.5" />
        <span className="text-[11px] truncate max-w-[100px]">{current?.shortLabel ?? current?.label}</span>
      </button>

      {/* Decimals selector for numeric types */}
      {isNumeric && onDecimalsChange && (
        <select
          value={decimals ?? 2}
          onChange={(e) => onDecimalsChange(parseInt(e.target.value))}
          className="bg-transparent border border-white/[0.06] rounded px-1 py-0.5 text-[10px] text-white/40 outline-none hover:border-white/15 hover:text-white/60 cursor-pointer"
          title="Nombre de décimales"
        >
          {[0, 1, 2, 3, 4, 5].map((d) => (
            <option key={d} value={d}>{d === 0 ? '0 déc.' : `${d} déc.`}</option>
          ))}
        </select>
      )}

      {open && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-[#1e1e1e] border border-white/15 rounded-xl shadow-2xl z-50 overflow-hidden">
          {/* Search */}
          <div className="px-3 py-2 border-b border-white/10">
            <div className="flex items-center gap-2 bg-white/5 rounded-lg px-2.5 py-1.5">
              <Search className="w-3.5 h-3.5 text-white/30" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Rechercher un champ"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-transparent text-sm text-white/80 placeholder:text-white/30 outline-none flex-1"
              />
            </div>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto py-1">
            {filtered.map((ft) => (
              <button
                key={ft.id}
                onClick={() => { onChange(ft.id); setOpen(false); setSearch('') }}
                className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                  ft.id === value
                    ? 'bg-indigo-500/15 text-indigo-300'
                    : 'text-white/70 hover:bg-white/5'
                }`}
              >
                <FieldTypeIcon type={ft.id} className="w-4 h-4 shrink-0" />
                <span className="text-sm">{ft.label}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-xs text-white/30 text-center py-4">Aucun resultat</p>
            )}
          </div>

          {/* Primary field option */}
          {showPrimary && onSetPrimary && (
            <div className="border-t border-white/10 px-3 py-2">
              <button
                onClick={() => { onSetPrimary(); setOpen(false) }}
                className="text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
              >
                Utiliser en tant que champ principal
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
