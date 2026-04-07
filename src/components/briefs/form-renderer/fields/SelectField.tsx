import type { ClientFormField } from '@/features/taxonomy/types'

interface Props {
  field: ClientFormField
  value: string | undefined
  onChange: (value: string) => void
  disabled?: boolean
}

export function SelectField({ field, value, onChange, disabled }: Props) {
  const options = field.options ?? []
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] text-white/70">
        {field.label}
        {field.required && <span className="text-red-400 ml-1">*</span>}
      </label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="bg-[#0f0f0f] border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-white focus:outline-none focus:border-indigo-500/60 disabled:opacity-50"
      >
        <option value="">—</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      {field.helpText && (
        <p className="text-[11px] text-white/40">{field.helpText}</p>
      )}
    </div>
  )
}
