import { Factory, Maximize2, BadgeCheck, ShieldAlert } from 'lucide-react'
import type { VerdictSummary } from './types'

interface Props {
  summary: VerdictSummary
  mfrHost: string | null
  eanMatch: boolean | null
  onOpen: () => void
}

function Stat({ n, label, cls }: { n: number; label: string; cls: string }) {
  return (
    <div className={`flex-1 rounded-lg border px-2 py-1.5 text-center ${cls}`}>
      <div className="text-[15px] font-bold tabular-nums leading-none">{n}</div>
      <div className="text-[9px] uppercase tracking-wide mt-0.5 opacity-80">{label}</div>
    </div>
  )
}

/** Carte RÉSULTAT bien visible dans la colonne « Source » : synthèse + accès à
 *  l'écran plein. Accent indigo pour la détacher du fond sombre. */
export function ManufacturerComparisonInline({ summary, mfrHost, eanMatch, onOpen }: Props) {
  return (
    <div className="m-3 rounded-xl border border-indigo-400/30 bg-gradient-to-b from-indigo-500/[0.14] to-indigo-500/[0.03] p-3.5 shadow-[0_4px_20px_-6px_rgba(79,70,229,0.4)]">
      {/* En-tête */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-lg bg-indigo-500/25 border border-indigo-400/30 flex items-center justify-center shrink-0">
          <Factory className="w-3.5 h-3.5 text-indigo-200" />
        </div>
        <span className="text-[12px] font-semibold text-white leading-tight">Comparaison Fabricant</span>
      </div>

      {/* Certitude EAN */}
      {eanMatch === true && (
        <div className="flex items-center gap-1.5 mb-3 px-2 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-medium text-emerald-300">
          <BadgeCheck className="w-4 h-4 shrink-0" /> Même produit certifié
        </div>
      )}
      {eanMatch === false && (
        <div className="flex items-center gap-1.5 mb-3 px-2 py-1.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-[11px] font-medium text-rose-300">
          <ShieldAlert className="w-4 h-4 shrink-0" /> EAN différents — variante ?
        </div>
      )}

      {/* Compteurs */}
      <div className="flex gap-1.5 mb-3">
        <Stat n={summary.confirmed} label="Confirmés" cls="border-emerald-500/25 bg-emerald-500/10 text-emerald-300" />
        <Stat n={summary.divergent} label="Divergents" cls="border-amber-500/25 bg-amber-500/10 text-amber-300" />
        <Stat n={summary.completed} label="Complétés" cls="border-indigo-500/25 bg-indigo-500/10 text-indigo-300" />
      </div>

      {/* CTA principal */}
      <button
        onClick={onOpen}
        className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-[#fff] text-[12px] font-semibold transition-colors shadow-md"
      >
        <Maximize2 className="w-4 h-4" /> Voir la comparaison complète
      </button>
      {mfrHost && <div className="mt-2 text-[10px] text-white/35 truncate text-center">{mfrHost}</div>}
    </div>
  )
}
