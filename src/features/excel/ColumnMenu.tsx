import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  MoreVertical, ArrowUp, ArrowDown, ArrowLeft, ArrowRight,
  ChevronsLeft, ChevronsRight, EyeOff, ArrowUpDown,
} from 'lucide-react'

interface ColumnMenuProps {
  colKey: string
  colIndex: number
  totalColumns: number
  sortDir: 'asc' | 'desc' | null
  onSort: (dir: 'asc' | 'desc') => void
  onClearSort: () => void
  onMoveLeft: () => void
  onMoveRight: () => void
  onMoveFirst: () => void
  onMoveLast: () => void
  onHide: () => void
}

export function ColumnMenu({
  colIndex, totalColumns, sortDir,
  onSort, onClearSort, onMoveLeft, onMoveRight, onMoveFirst, onMoveLast, onHide,
}: ColumnMenuProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const menuRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  const updatePos = useCallback(() => {
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + 4, left: Math.min(rect.right - 220, window.innerWidth - 230) })
  }, [])

  useEffect(() => {
    if (!open) return
    updatePos()
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const handleScroll = () => setOpen(false)
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('scroll', handleScroll, true)
    }
  }, [open, updatePos])

  const action = (fn: () => void) => {
    fn()
    setOpen(false)
  }

  const isFirst = colIndex === 0
  const isLast = colIndex === totalColumns - 1

  return (
    <>
      <button
        ref={btnRef}
        onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
        className="p-0.5 rounded hover:bg-white/10 text-white/25 hover:text-white/60 transition-colors"
      >
        <MoreVertical className="w-3.5 h-3.5" />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          className="fixed w-56 bg-[#1e1e1e] border border-white/15 rounded-xl shadow-2xl py-1.5 text-xs animate-in fade-in zoom-in-95 duration-150"
          style={{ top: pos.top, left: pos.left, zIndex: 9999 }}
        >
          {/* Sort section */}
          <div className="px-3 py-1.5 text-[10px] text-white/30 uppercase tracking-wider font-semibold">Trier</div>
          <MenuItem
            icon={<ArrowUp className="w-3.5 h-3.5" />}
            label="Tri croissant (A→Z)"
            active={sortDir === 'asc'}
            onClick={() => action(() => onSort('asc'))}
          />
          <MenuItem
            icon={<ArrowDown className="w-3.5 h-3.5" />}
            label="Tri décroissant (Z→A)"
            active={sortDir === 'desc'}
            onClick={() => action(() => onSort('desc'))}
          />
          {sortDir && (
            <MenuItem
              icon={<ArrowUpDown className="w-3.5 h-3.5" />}
              label="Annuler le tri"
              onClick={() => action(onClearSort)}
            />
          )}

          <div className="h-px bg-white/10 mx-2 my-1.5" />

          {/* Reorder section */}
          <div className="px-3 py-1.5 text-[10px] text-white/30 uppercase tracking-wider font-semibold">Déplacer</div>
          <MenuItem
            icon={<ChevronsLeft className="w-3.5 h-3.5" />}
            label="En première position"
            disabled={isFirst}
            onClick={() => action(onMoveFirst)}
          />
          <MenuItem
            icon={<ArrowLeft className="w-3.5 h-3.5" />}
            label="Vers la gauche"
            disabled={isFirst}
            onClick={() => action(onMoveLeft)}
          />
          <MenuItem
            icon={<ArrowRight className="w-3.5 h-3.5" />}
            label="Vers la droite"
            disabled={isLast}
            onClick={() => action(onMoveRight)}
          />
          <MenuItem
            icon={<ChevronsRight className="w-3.5 h-3.5" />}
            label="En dernière position"
            disabled={isLast}
            onClick={() => action(onMoveLast)}
          />

          <div className="h-px bg-white/10 mx-2 my-1.5" />

          {/* Hide */}
          <MenuItem
            icon={<EyeOff className="w-3.5 h-3.5" />}
            label="Masquer la colonne"
            disabled={totalColumns <= 1}
            danger
            onClick={() => action(onHide)}
          />
        </div>,
        document.body,
      )}
    </>
  )
}

function MenuItem({ icon, label, active, disabled, danger, onClick }: {
  icon: React.ReactNode
  label: string
  active?: boolean
  disabled?: boolean
  danger?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
        disabled
          ? 'text-white/15 cursor-not-allowed'
          : active
            ? 'text-indigo-400 bg-indigo-500/10'
            : danger
              ? 'text-red-400/70 hover:text-red-400 hover:bg-red-500/10'
              : 'text-white/60 hover:text-white/90 hover:bg-white/5'
      }`}
    >
      {icon}
      <span>{label}</span>
      {active && <span className="ml-auto text-[10px] text-indigo-400/60 font-medium">actif</span>}
    </button>
  )
}
