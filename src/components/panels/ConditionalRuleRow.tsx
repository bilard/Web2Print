import { Trash2 } from 'lucide-react'
import { ColorPicker } from '@/components/shared/ColorPicker'
import type { MergeColumn } from '@/stores/merge.store'
import {
  OPERATOR_LABELS, ACTION_LABELS, VALUELESS_OPERATORS, actionWithDefaults,
  DEFAULT_RULE_COLOR, DEFAULT_RULE_OPACITY, DEFAULT_RULE_SCALE,
  type ConditionalRule, type RuleOperator, type RuleActionType,
} from '@/features/merge/conditionalRules'
import { useTranslation } from '@/lib/i18n'

const SELECT_CLS =
  'flex-1 min-w-0 bg-well border border-white/10 rounded px-1.5 py-1 text-[11px] text-white/80 outline-none focus:border-indigo-500'
const INPUT_CLS =
  'flex-1 min-w-0 bg-well border border-white/10 rounded px-1.5 py-1 text-[11px] text-white/80 outline-none focus:border-indigo-500'

export function ConditionalRuleRow({ rule, columns, onChange, onRemove }: {
  rule: ConditionalRule
  columns: MergeColumn[]
  onChange: (next: ConditionalRule) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const needsValue = !VALUELESS_OPERATORS.has(rule.operator)
  const { action } = rule

  return (
    <div className="flex flex-col gap-1.5 bg-surface-2 rounded p-2 border border-white/5">
      {/* Champ + supprimer */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-white/40 shrink-0">{t('rule.if')}</span>
        <select className={SELECT_CLS} value={rule.field}
          onChange={(e) => onChange({ ...rule, field: e.target.value })}>
          {!columns.some((c) => c.key === rule.field || c.label === rule.field) && (
            <option value={rule.field}>{rule.field || '— champ —'}</option>
          )}
          {columns.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <button onClick={onRemove} title={t('rule.delete')}
          className="shrink-0 text-white/30 hover:text-red-400 transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Opérateur + valeur */}
      <div className="flex items-center gap-1.5">
        <select className={SELECT_CLS} value={rule.operator}
          onChange={(e) => onChange({ ...rule, operator: e.target.value as RuleOperator })}>
          {(Object.keys(OPERATOR_LABELS) as RuleOperator[]).map((op) => (
            <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>
          ))}
        </select>
        {needsValue && (
          <input className={INPUT_CLS} value={rule.value ?? ''} placeholder={t('rule.value')}
            onChange={(e) => onChange({ ...rule, value: e.target.value })} />
        )}
      </div>

      {/* Action + paramètre */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-white/40 shrink-0">{t('rule.then')}</span>
        <select className={SELECT_CLS} value={action.type}
          onChange={(e) => onChange({ ...rule, action: actionWithDefaults(e.target.value as RuleActionType, action) })}>
          {(Object.keys(ACTION_LABELS) as RuleActionType[]).map((a) => (
            <option key={a} value={a}>{ACTION_LABELS[a]}</option>
          ))}
        </select>
        {action.type === 'setColor' && (
          <div className="shrink-0">
            <ColorPicker value={action.color ?? DEFAULT_RULE_COLOR}
              onChange={(color) => onChange({ ...rule, action: { type: 'setColor', color } })} />
          </div>
        )}
        {action.type === 'setOpacity' && (
          <input type="number" min={0} max={100} step={5} className={`${INPUT_CLS} max-w-[64px]`}
            value={Math.round((action.opacity ?? DEFAULT_RULE_OPACITY) * 100)}
            onChange={(e) => onChange({ ...rule, action: { type: 'setOpacity', opacity: (Number(e.target.value) || 0) / 100 } })} />
        )}
        {action.type === 'scale' && (
          <input type="number" min={10} step={10} className={`${INPUT_CLS} max-w-[64px]`}
            value={Math.round((action.scale ?? DEFAULT_RULE_SCALE) * 100)}
            onChange={(e) => onChange({ ...rule, action: { type: 'scale', scale: (Number(e.target.value) || 100) / 100 } })} />
        )}
        {(action.type === 'setOpacity' || action.type === 'scale') && (
          <span className="text-[10px] text-white/40 shrink-0">%</span>
        )}
      </div>
    </div>
  )
}
