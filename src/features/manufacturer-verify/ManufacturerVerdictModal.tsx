import { Factory } from 'lucide-react'
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

/** Écran plein (modal) de la comparaison Source ⇄ Fabricant, ouvert depuis la
 *  fiche pour un produit DÉJÀ vérifié (recompute déterministe, aucun re-scrape). */
export function ManufacturerVerdictModal({ onClose, ...verdict }: Props) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-white/10 bg-background shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-white/[0.06] shrink-0">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center">
            <Factory className="w-4 h-4 text-indigo-300" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-white">Comparaison Source ⇄ Fabricant</div>
            <div className="text-[11px] text-white/40 truncate">{verdict.sourceLabel}</div>
          </div>
          <CloseButton onClick={onClose} size="sm" />
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-5">
          <ManufacturerVerdict {...verdict} />
        </div>
      </div>
    </div>
  )
}
