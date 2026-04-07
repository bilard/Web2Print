import { Trash2 } from 'lucide-react'
import type { ClientFormField } from '@/features/taxonomy/types'

interface Props {
  field: ClientFormField | null
  onChange: (patch: Partial<ClientFormField>) => void
  onDelete: () => void
}

export function FieldEditor({ field, onChange, onDelete }: Props) {
  if (!field) {
    return (
      <div className="h-full flex items-center justify-center text-[12px] text-white/30">
        Sélectionnez un champ pour l'éditer
      </div>
    )
  }

  const isSelect = field.type === 'select'

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] uppercase tracking-wide text-white/40 font-semibold">
          Édition du champ
        </h3>
        {field.builtin && (
          <span className="text-[10px] uppercase tracking-wide text-indigo-400/80 bg-indigo-500/10 px-2 py-0.5 rounded">
            builtin
          </span>
        )}
      </div>

      <Label>Label</Label>
      <Input
        value={field.label}
        onChange={(v) => onChange({ label: v })}
      />

      <Label>Aide (helpText)</Label>
      <Input
        value={field.helpText ?? ''}
        onChange={(v) => onChange({ helpText: v || undefined })}
      />

      <Label>Placeholder</Label>
      <Input
        value={field.placeholder ?? ''}
        onChange={(v) => onChange({ placeholder: v || undefined })}
      />

      <label className="flex items-center gap-2 text-[12px] text-white/70 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={field.required}
          onChange={(e) => onChange({ required: e.target.checked })}
          className="w-4 h-4 accent-indigo-500"
        />
        Obligatoire
      </label>

      {isSelect && (
        <>
          <Label>Options (une par ligne)</Label>
          <textarea
            value={(field.options ?? []).join('\n')}
            onChange={(e) => onChange({ options: e.target.value.split('\n').filter(Boolean) })}
            rows={5}
            className="bg-[#0f0f0f] border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-white focus:outline-none focus:border-indigo-500/60 font-mono"
          />
        </>
      )}

      {!field.builtin && (
        <button
          onClick={onDelete}
          className="mt-2 flex items-center gap-2 text-[12px] text-red-400 hover:text-red-300 hover:bg-red-500/10 px-3 py-2 rounded-md transition-colors self-start"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Supprimer ce champ
        </button>
      )}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-[12px] text-white/70 -mb-2">{children}</label>
}

function Input({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-[#0f0f0f] border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-white focus:outline-none focus:border-indigo-500/60"
    />
  )
}
