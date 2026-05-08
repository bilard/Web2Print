// src/features/workflows/editor/configFields/index.tsx
import type { ConfigField } from '../../types'

interface FieldProps {
  field: ConfigField
  value: unknown
  onChange: (next: unknown) => void
}

const inputCls = 'w-full bg-[#0f0f0f] border border-neutral-700 rounded px-2 py-1.5 text-sm text-white focus:border-indigo-500 outline-none'

export function ConfigFieldRenderer({ field, value, onChange }: FieldProps) {
  switch (field.kind) {
    case 'text':
    case 'expression':
    case 'columnRef':
      return <input type="text" className={inputCls} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} placeholder={field.help} />
    case 'textarea':
      return <textarea className={inputCls + ' min-h-[80px]'} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
    case 'number':
      return <input type="number" className={inputCls} value={Number(value ?? 0)} onChange={(e) => onChange(Number(e.target.value))} />
    case 'checkbox':
      return <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
    case 'select':
      return (
        <select className={inputCls} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )
    default:
      return <span className="text-xs text-red-400">Unknown field kind: {(field as any).kind}</span>
  }
}
