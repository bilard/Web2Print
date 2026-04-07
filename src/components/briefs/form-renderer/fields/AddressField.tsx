import type { ClientFormField } from '@/features/taxonomy/types'

interface AddressValue {
  street?: string
  postalCode?: string
  city?: string
  country?: string
}

interface Props {
  field: ClientFormField
  value: AddressValue | undefined
  onChange: (value: AddressValue) => void
  disabled?: boolean
}

export function AddressField({ field, value, onChange, disabled }: Props) {
  const current: AddressValue = value ?? {}
  const baseInput = "bg-[#0f0f0f] border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-indigo-500/60 disabled:opacity-50"

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] text-white/70">
        {field.label}
        {field.required && <span className="text-red-400 ml-1">*</span>}
      </label>
      <div className="flex flex-col gap-2">
        <input
          type="text"
          value={current.street ?? ''}
          onChange={(e) => onChange({ ...current, street: e.target.value })}
          placeholder="Rue"
          disabled={disabled}
          className={baseInput}
        />
        <div className="grid grid-cols-[110px_1fr] gap-2">
          <input
            type="text"
            value={current.postalCode ?? ''}
            onChange={(e) => onChange({ ...current, postalCode: e.target.value })}
            placeholder="Code postal"
            disabled={disabled}
            className={baseInput}
          />
          <input
            type="text"
            value={current.city ?? ''}
            onChange={(e) => onChange({ ...current, city: e.target.value })}
            placeholder="Ville"
            disabled={disabled}
            className={baseInput}
          />
        </div>
        <input
          type="text"
          value={current.country ?? 'France'}
          onChange={(e) => onChange({ ...current, country: e.target.value })}
          placeholder="Pays"
          disabled={disabled}
          className={baseInput}
        />
      </div>
      {field.helpText && (
        <p className="text-[11px] text-white/40">{field.helpText}</p>
      )}
    </div>
  )
}
