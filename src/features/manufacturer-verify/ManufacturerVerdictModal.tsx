import { useCallback, useRef, useState } from 'react'
import { Factory, GripVertical } from 'lucide-react'
import { CloseButton } from '@/components/shared/CloseButton'
import { ManufacturerVerdict } from './ManufacturerVerdict'
import type { FieldComparison, VerdictSummary } from './types'

interface Props {
  sourceUrl: string | null
  sourceLabel: string
  mfrUrl: string | null
  mfrLabel: string
  summary: VerdictSummary
  comparisons: FieldComparison[]
  eanMatch?: boolean | null
  onToggleAdopt?: (c: FieldComparison, adopt: boolean) => void
  busy?: boolean
  onClose: () => void
}

/** Panneau FLOTTANT de la comparaison Source ⇄ Fabricant : ancré à gauche,
 *  déplaçable par son header, SANS fond bloquant → la fiche produit (droite)
 *  reste visible et se met à jour en direct pendant l'adoption. */
export function ManufacturerVerdictModal({ onClose, ...verdict }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number }>(() => ({ x: 16, y: 76 }))
  const originRef = useRef<{ dx: number; dy: number } | null>(null)

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    originRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
    const onMove = (ev: MouseEvent) => {
      if (!originRef.current) return
      setPos({
        x: Math.max(8, Math.min(ev.clientX - originRef.current.dx, window.innerWidth - 160)),
        y: Math.max(8, Math.min(ev.clientY - originRef.current.dy, window.innerHeight - 56)),
      })
    }
    const onUp = () => {
      originRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.userSelect = ''
    }
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [pos.x, pos.y])

  return (
    <div
      className="fixed z-[60] flex flex-col rounded-2xl border border-white/10 bg-background shadow-2xl overflow-hidden max-h-[86vh]"
      style={{ left: pos.x, top: pos.y, width: 'min(760px, 47vw)' }}
    >
      {/* Header = poignée de déplacement */}
      <div
        onMouseDown={onDragStart}
        className="flex items-center gap-2.5 px-5 py-3.5 border-b border-white/[0.06] shrink-0 cursor-move select-none bg-well"
      >
        <GripVertical className="w-4 h-4 text-white/25 shrink-0 -ml-1" />
        <div className="w-7 h-7 rounded-lg bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center shrink-0">
          <Factory className="w-4 h-4 text-indigo-300" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-white">Comparaison Source ⇄ Fabricant</div>
          <div className="text-[11px] text-white/40 truncate">{verdict.sourceLabel}</div>
        </div>
        <span onMouseDown={(e) => e.stopPropagation()}>
          <CloseButton onClick={onClose} size="sm" />
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-5 pb-5">
        <ManufacturerVerdict {...verdict} />
      </div>
    </div>
  )
}
