import { Factory } from 'lucide-react'
import type { CompareStatus, FieldComparison } from './types'

interface Props {
  comparisons: FieldComparison[]
  mfrHost: string | null
}

const BADGE: Record<CompareStatus, { sym: string; cls: string; title: string }> = {
  match:         { sym: '=', cls: 'text-emerald-400 bg-emerald-500/10', title: 'Identique au fabricant' },
  diff:          { sym: '≠', cls: 'text-amber-400 bg-amber-500/10', title: 'Diffère du fabricant' },
  'mfr-only':    { sym: '+', cls: 'text-indigo-300 bg-indigo-500/10', title: 'Présent seulement chez le fabricant' },
  'source-only': { sym: '·', cls: 'text-white/40 bg-white/[0.04]', title: 'Présent seulement chez la source' },
}

/** Comparaison Source ⇄ Fabricant intégrée à la colonne « Source » de la fiche. */
export function ManufacturerComparisonInline({ comparisons, mfrHost }: Props) {
  if (comparisons.length === 0) return null
  const confirmed = comparisons.filter((c) => c.status === 'match').length
  const diff = comparisons.filter((c) => c.status === 'diff').length
  const mfrOnly = comparisons.filter((c) => c.status === 'mfr-only').length

  return (
    <div className="px-4 py-3 border-b border-white/[0.06]">
      <div className="flex items-center gap-1.5 mb-2">
        <Factory className="w-3 h-3 text-indigo-300" />
        <span className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">Comparaison Fabricant</span>
      </div>
      <div className="flex gap-1.5 mb-2 text-[10px]">
        <span className="px-1.5 py-[1px] rounded bg-emerald-500/10 text-emerald-400">{confirmed} = </span>
        <span className="px-1.5 py-[1px] rounded bg-amber-500/10 text-amber-400">{diff} ≠</span>
        <span className="px-1.5 py-[1px] rounded bg-indigo-500/10 text-indigo-300">{mfrOnly} +</span>
        {mfrHost && <span className="ml-auto text-white/30 truncate">{mfrHost}</span>}
      </div>
      <div className="flex flex-col gap-1">
        {comparisons.map((c) => {
          const b = BADGE[c.status]
          return (
            <div key={c.key} className="grid grid-cols-[1fr_auto] gap-x-2 items-start py-1 border-t border-white/[0.03]">
              <span className="text-[11px] text-white/45">{c.label}</span>
              <span className={`justify-self-end text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded ${b.cls}`} title={b.title}>{b.sym}</span>
              <span className="text-[11px] text-white/35 truncate col-start-1" title={c.sourceValue ?? ''}>
                <span className="text-white/25">S:</span> {c.sourceValue ?? '—'}
              </span>
              <span className={`text-[11px] truncate col-start-1 ${c.mfrValue ? 'text-white/70' : 'text-white/25'}`} title={c.mfrValue ?? ''}>
                <span className="text-indigo-300/50">F:</span> {c.mfrValue ?? '—'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
