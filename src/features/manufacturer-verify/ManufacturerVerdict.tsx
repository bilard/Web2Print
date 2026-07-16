import { Globe, Factory, Check, AlertTriangle, Plus } from 'lucide-react'
import type { CompareStatus, FieldComparison, VerdictSummary } from './types'

interface Props {
  sourceUrl: string | null
  sourceLabel: string
  mfrUrl: string | null
  mfrLabel: string
  summary: VerdictSummary
  comparisons: FieldComparison[]
}

const hostOf = (url: string | null): string => {
  if (!url) return ''
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

const STATUS_META: Record<CompareStatus, { label: string; cls: string }> = {
  match:         { label: 'identique',  cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  diff:          { label: 'diffère',    cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  'mfr-only':    { label: 'fabricant',  cls: 'text-indigo-300 bg-indigo-500/10 border-indigo-500/20' },
  'source-only': { label: 'source',     cls: 'text-white/40 bg-white/[0.04] border-white/10' },
}

const GROUP_LABEL: Record<FieldComparison['group'], string> = {
  identity: 'Identité', price: 'Prix', spec: 'Spécifications techniques',
}

function Tile({ n, label, tone, icon }: { n: number; label: string; tone: string; icon: React.ReactNode }) {
  return (
    <div className="flex-1 rounded-xl border border-white/[0.06] bg-surface-2 px-4 py-3">
      <div className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${tone}`}>
        {icon}{label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-white">{n}</div>
    </div>
  )
}

/** Vue verdict « la vérité est chez le fabricant » — comparaison Source ⇄ Fabricant. */
export function ManufacturerVerdict({ sourceUrl, sourceLabel, mfrUrl, mfrLabel, summary, comparisons }: Props) {
  const groups: FieldComparison['group'][] = ['identity', 'price', 'spec']

  return (
    <div className="flex flex-col gap-4">
      {/* En-tête narratif : source ⇄ fabricant */}
      <div className="flex items-center gap-3 rounded-xl border border-indigo-500/20 bg-indigo-500/[0.06] px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] text-white/40">
            <Globe className="w-3.5 h-3.5" /> Source revendeur
          </div>
          <div className="text-[13px] font-medium text-white/70 truncate">{sourceLabel}</div>
          <div className="text-[11px] text-white/35 truncate">{hostOf(sourceUrl)}</div>
        </div>
        <div className="text-white/25 text-lg shrink-0">⇄</div>
        <div className="flex-1 min-w-0 text-right">
          <div className="flex items-center justify-end gap-1.5 text-[11px] text-indigo-300/80">
            Fabricant officiel <Factory className="w-3.5 h-3.5" />
          </div>
          <div className="text-[13px] font-semibold text-white truncate">{mfrLabel}</div>
          <div className="text-[11px] text-indigo-300/50 truncate">{hostOf(mfrUrl)}</div>
        </div>
      </div>

      {/* Compteurs */}
      <div className="flex gap-2.5">
        <Tile n={summary.confirmed} label="Confirmés" tone="text-emerald-400" icon={<Check className="w-3.5 h-3.5" />} />
        <Tile n={summary.completed} label="Complétés" tone="text-indigo-300" icon={<Plus className="w-3.5 h-3.5" />} />
        <Tile n={summary.divergent} label="Divergents" tone="text-amber-400" icon={<AlertTriangle className="w-3.5 h-3.5" />} />
      </div>

      {/* Tableau comparatif groupé */}
      <div className="rounded-xl border border-white/[0.06] overflow-hidden">
        <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 px-4 py-2 bg-well text-[10px] font-semibold uppercase tracking-wider text-white/35">
          <span>Champ</span><span>Source</span><span>Fabricant</span><span className="text-right">État</span>
        </div>
        {groups.map((g) => {
          const rows = comparisons.filter((c) => c.group === g)
          if (rows.length === 0) return null
          return (
            <div key={g}>
              <div className="px-4 py-1.5 bg-surface-2 text-[10px] font-semibold uppercase tracking-wider text-white/45 border-t border-white/[0.05]">
                {GROUP_LABEL[g]}
              </div>
              {rows.map((c) => {
                const meta = STATUS_META[c.status]
                return (
                  <div key={c.key} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center px-4 py-2 border-t border-white/[0.03]">
                    <span className="text-[12px] text-white/60">{c.label}</span>
                    <span className="text-[12px] text-white/45 truncate" title={c.sourceValue ?? ''}>{c.sourceValue ?? '—'}</span>
                    <span className={`text-[12px] truncate ${c.mfrValue ? 'text-white/85 font-medium' : 'text-white/30'}`} title={c.mfrValue ?? ''}>
                      {c.mfrValue ?? '—'}
                    </span>
                    <span className={`justify-self-end text-[10px] font-semibold px-2 py-[2px] rounded-full border whitespace-nowrap ${meta.cls}`}>
                      {c.status === 'match' ? '=' : c.status === 'diff' ? '≠' : c.status === 'mfr-only' ? '+' : '·'} {meta.label}
                    </span>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
