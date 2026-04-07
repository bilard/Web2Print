import type { ClientFormField } from '@/features/taxonomy/types'

interface BudgetValue {
  min?: number
  max?: number
}

interface Props {
  field: ClientFormField
  value: BudgetValue | undefined
  onChange: (value: BudgetValue) => void
  disabled?: boolean
}

export function BudgetRangeField({ field, value, onChange, disabled }: Props) {
  const current: BudgetValue = value ?? {}
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] text-white/70">
        {field.label}
        {field.required && <span className="text-red-400 ml-1">*</span>}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={current.min ?? ''}
          onChange={(e) => onChange({ ...current, min: e.target.value === '' ? undefined : Number(e.target.value) })}
          placeholder="Min €"
          disabled={disabled}
          className="flex-1 bg-[#0f0f0f] border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-indigo-500/60 disabled:opacity-50"
        />
        <span className="text-white/30 text-[12px]">—</span>
        <input
          type="number"
          value={current.max ?? ''}
          onChange={(e) => onChange({ ...current, max: e.target.value === '' ? undefined : Number(e.target.value) })}
          placeholder="Max €"
          disabled={disabled}
          className="flex-1 bg-[#0f0f0f] border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-indigo-500/60 disabled:opacity-50"
        />
      </div>
      {field.helpText && (
        <p className="text-[11px] text-white/40">{field.helpText}</p>
      )}
    </div>
  )
}
