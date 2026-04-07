import { ImageUp } from 'lucide-react'
import type { ClientFormField } from '@/features/taxonomy/types'

interface Props {
  field: ClientFormField
  value: string | undefined
  onChange: (value: string) => void
  disabled?: boolean
}

// MVP : stocke une URL d'image. L'upload vers Firebase Storage sera ajouté au Lot 3.
export function LogoUploadField({ field, value, onChange, disabled }: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] text-white/70">
        {field.label}
        {field.required && <span className="text-red-400 ml-1">*</span>}
      </label>
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 rounded-md bg-[#0f0f0f] border border-white/[0.08] flex items-center justify-center overflow-hidden">
          {value ? (
            <img src={value} alt="logo" className="w-full h-full object-contain" />
          ) : (
            <ImageUp className="w-5 h-5 text-white/30" />
          )}
        </div>
        <input
          type="url"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://..."
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
