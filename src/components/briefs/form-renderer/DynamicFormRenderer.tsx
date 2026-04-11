import type { ClientFormField } from '@/features/taxonomy/types'
import { TextField } from './fields/TextField'
import { TextareaField } from './fields/TextareaField'
import { NumberField } from './fields/NumberField'
import { EmailField } from './fields/EmailField'
import { SelectField } from './fields/SelectField'
import { ColorField } from './fields/ColorField'
import { LogoUploadField } from './fields/LogoUploadField'
import { BrandKitUploadField } from './fields/BrandKitUploadField'
import { BudgetRangeField } from './fields/BudgetRangeField'
import { AddressField } from './fields/AddressField'

interface Props {
  fields: ClientFormField[]
  values: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
  disabled?: boolean
  briefId?: string
}

/**
 * Rend un formulaire dynamique à partir d'un template de champs.
 * Groupe les champs par `field.group` et ordonne par `field.order`.
 */
export function DynamicFormRenderer({
  fields,
  values,
  onChange,
  disabled,
  briefId,
}: Props) {
  const sorted = [...fields].filter((f) => !f.hidden).sort((a, b) => a.order - b.order)
  const grouped = groupByGroup(sorted)

  return (
    <div className="flex flex-col gap-6">
      {grouped.map(({ group, items }) => (
        <section key={group ?? '_'} className="flex flex-col gap-3">
          {group && (
            <h3 className="text-[11px] uppercase tracking-wide text-white/40 font-semibold">
              {group}
            </h3>
          )}
          <div className="flex flex-col gap-4">
            {items.map((field) => (
              <FieldRenderer
                key={field.id}
                field={field}
                value={values[field.key]}
                onChange={(v) => onChange(field.key, v)}
                disabled={disabled}
                briefId={briefId}
                onSiblingChange={onChange}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function groupByGroup(fields: ClientFormField[]) {
  const map = new Map<string | undefined, ClientFormField[]>()
  for (const f of fields) {
    const k = f.group
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(f)
  }
  return Array.from(map.entries()).map(([group, items]) => ({ group, items }))
}

interface FieldRendererProps {
  field: ClientFormField
  value: unknown
  onChange: (value: unknown) => void
  disabled?: boolean
  briefId?: string
  onSiblingChange?: (key: string, value: unknown) => void
}

function FieldRenderer({ field, value, onChange, disabled, briefId, onSiblingChange }: FieldRendererProps) {
  switch (field.type) {
    case 'text':
      return <TextField field={field} value={value as string} onChange={onChange} disabled={disabled} />
    case 'textarea':
      return <TextareaField field={field} value={value as string} onChange={onChange} disabled={disabled} />
    case 'number':
      return <NumberField field={field} value={value as number} onChange={onChange} disabled={disabled} />
    case 'email':
      return <EmailField field={field} value={value as string} onChange={onChange} disabled={disabled} />
    case 'select':
      return <SelectField field={field} value={value as string} onChange={onChange} disabled={disabled} />
    case 'color':
      return <ColorField field={field} value={value as string} onChange={onChange} disabled={disabled} />
    case 'logo_upload':
      return <LogoUploadField field={field} value={value as string} onChange={onChange} disabled={disabled} briefId={briefId} />
    case 'brand_kit_upload':
      return (
        <BrandKitUploadField
          field={field}
          value={value as { url?: string; filename?: string; contentType?: string; size?: number }}
          onChange={onChange}
          disabled={disabled}
          briefId={briefId}
          onSiblingChange={onSiblingChange}
        />
      )
    case 'budget_range':
      return <BudgetRangeField field={field} value={value as { min?: number; max?: number }} onChange={onChange} disabled={disabled} />
    case 'address':
      return <AddressField field={field} value={value as { street?: string; postalCode?: string; city?: string; country?: string }} onChange={onChange} disabled={disabled} />
    default: {
      const _exhaust: never = field.type
      return <div className="text-red-400 text-[12px]">Type de champ inconnu: {String(_exhaust)}</div>
    }
  }
}
