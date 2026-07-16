import { Factory, Maximize2, BadgeCheck, ShieldAlert } from 'lucide-react'
import type { VerdictSummary } from './types'

interface Props {
  summary: VerdictSummary
  mfrHost: string | null
  eanMatch: boolean | null
  onOpen: () => void
}

/** Carte COMPACTE dans la colonne « Source » de la fiche : synthèse + bouton
 *  vers l'écran plein. Pas de tableau ici (colonne trop étroite → illisible). */
export function ManufacturerComparisonInline({ summary, mfrHost, eanMatch, onOpen }: Props) {
  return (
    <div className="px-4 py-3 border-b border-white/[0.06]">
      <div className="flex items-center gap-1.5 mb-2">
        <Factory className="w-3 h-3 text-indigo-300" />
        <span className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">Comparaison Fabricant</span>
      </div>

      {/* Certitude EAN */}
      {eanMatch === true && (
        <div className="flex items-center gap-1.5 mb-2 text-[10px] text-emerald-300">
          <BadgeCheck className="w-3.5 h-3.5" /> Même produit certifié (EAN)
        </div>
      )}
      {eanMatch === false && (
        <div className="flex items-center gap-1.5 mb-2 text-[10px] text-rose-300">
          <ShieldAlert className="w-3.5 h-3.5" /> EAN différents — variante ?
        </div>
      )}

      {/* Compteurs (specs) */}
      <div className="flex gap-1.5 mb-2.5 text-[10px]">
        <span className="px-1.5 py-[2px] rounded bg-emerald-500/10 text-emerald-400">{summary.confirmed} confirmés</span>
        <span className="px-1.5 py-[2px] rounded bg-amber-500/10 text-amber-400">{summary.divergent} divergents</span>
        <span className="px-1.5 py-[2px] rounded bg-indigo-500/10 text-indigo-300">{summary.completed} +</span>
      </div>

      <button
        onClick={onOpen}
        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/12 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/25 text-[11px] font-medium transition-colors"
      >
        <Maximize2 className="w-3.5 h-3.5" /> Voir la comparaison complète
      </button>
      {mfrHost && <div className="mt-1.5 text-[10px] text-white/30 truncate text-center">{mfrHost}</div>}
    </div>
  )
}
