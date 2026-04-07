import type { ClientFormField } from '@/features/taxonomy/types'

interface Props {
  field: ClientFormField
  value: string | undefined
  onChange: (value: string) => void
  disabled?: boolean
}

export function ColorField({ field, value, onChange, disabled }: Props) {
  const hex = value ?? '#6366f1'
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] text-white/70">
        {field.label}
        {field.required && <span className="text-red-400 ml-1">*</span>}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={hex}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-10 h-10 rounded-md bg-[#0f0f0f] border border-white/[0.08] cursor-pointer disabled:opacity-50"
        />
        <input
          type="text"
          value={hex}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="flex-1 bg-[#0f0f0f] border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-white font-mono focus:outline-none focus:border-indigo-500/60 disabled:opacity-50"
        />
      </div>
      {field.helpText && (
        <p className="text-[11px] text-white/40">{field.helpText}</p>
      )}
    </div>
  )
}
