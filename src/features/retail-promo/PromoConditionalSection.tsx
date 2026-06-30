import { Plus, Trash2 } from 'lucide-react'
import { ColorPicker } from '@/components/shared/ColorPicker'
import { useRetailPromoStore } from './retailPromo.store'
import { Section, inputCls } from './promoPanelUi'
import {
  OPERATOR_LABELS, ACTION_LABELS, VALUELESS_OPERATORS, actionWithDefaults,
  DEFAULT_RULE_OPACITY, DEFAULT_RULE_SCALE,
  type ConditionalRule, type RuleOperator, type RuleActionType,
} from '@/features/merge/conditionalRules'
import type { PromoBlockId } from './RetailPromoCard'

const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `r${Math.round(performance.now() * 1000)}`)

/** Section « Règles conditionnelles » par élément (afficher/styler selon la valeur d'une colonne). */
export function PromoConditionalSection({ id }: { id: PromoBlockId }) {
  const { config, rawColumns, setRules } = useRetailPromoStore()
  const rules = config.rules?.[id] ?? []
  const update = (next: ConditionalRule[]) => setRules(id, next)
  const patch = (rid: string, p: Partial<ConditionalRule>) => update(rules.map((r) => r.id === rid ? { ...r, ...p } : r))
  const add = () => update([...rules, { id: uid(), field: rawColumns[0]?.key ?? '', operator: 'contains', value: '', action: { type: 'hide' } }])

  return (
    <Section title="Règles conditionnelles" defaultOpen={false} badge={rules.length ? `(${rules.length})` : undefined}>
      <div className="flex flex-col gap-3">
        {rawColumns.length === 0 && <p className="text-[11px] text-white/40">Connectez une source de données pour utiliser des règles.</p>}
        {rules.map((r) => {
          const noValue = VALUELESS_OPERATORS.has(r.operator)
          return (
            <div key={r.id} className="flex flex-col gap-1.5 rounded border border-white/10 bg-well/50 p-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] uppercase text-white/40">Si</span>
                <select value={r.field} onChange={(e) => patch(r.id, { field: e.target.value })} className={inputCls}>
                  {rawColumns.map((c) => <option key={c.key} value={c.key}>{c.label || c.key}</option>)}
                </select>
                <button onClick={() => update(rules.filter((x) => x.id !== r.id))} className="shrink-0 text-white/40 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              <div className="flex gap-1.5">
                <select value={r.operator} onChange={(e) => patch(r.id, { operator: e.target.value as RuleOperator })} className={inputCls}>
                  {(Object.keys(OPERATOR_LABELS) as RuleOperator[]).map((op) => <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>)}
                </select>
                {!noValue && <input value={r.value ?? ''} onChange={(e) => patch(r.id, { value: e.target.value })} placeholder="valeur" className={inputCls} />}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] uppercase text-white/40">alors</span>
                <select value={r.action.type} onChange={(e) => patch(r.id, { action: actionWithDefaults(e.target.value as RuleActionType, r.action) })} className={inputCls}>
                  {(Object.keys(ACTION_LABELS) as RuleActionType[]).map((a) => <option key={a} value={a}>{ACTION_LABELS[a]}</option>)}
                </select>
              </div>
              {r.action.type === 'setColor' && <ColorPicker value={r.action.color ?? '#e11d48'} onChange={(c) => patch(r.id, { action: { type: 'setColor', color: c } })} />}
              {r.action.type === 'setOpacity' && (
                <input type="number" min={0} max={100} value={Math.round((r.action.opacity ?? DEFAULT_RULE_OPACITY) * 100)}
                  onChange={(e) => patch(r.id, { action: { type: 'setOpacity', opacity: Number(e.target.value) / 100 } })} className={inputCls} />
              )}
              {r.action.type === 'scale' && (
                <input type="number" min={10} step={10} value={Math.round((r.action.scale ?? DEFAULT_RULE_SCALE) * 100)}
                  onChange={(e) => patch(r.id, { action: { type: 'scale', scale: Number(e.target.value) / 100 } })} className={inputCls} />
              )}
            </div>
          )
        })}
        <button onClick={add} disabled={rawColumns.length === 0}
          className="flex items-center justify-center gap-1.5 rounded border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 disabled:opacity-40">
          <Plus className="h-3.5 w-3.5" /> Ajouter une règle
        </button>
      </div>
    </Section>
  )
}
