// Éditeur de champs libres partagé (Catalogue studio + Création studio) : chaque
// ligne mappe une colonne source arbitraire, nommée par l'utilisateur (le nom sert
// de repère — seules les VALEURS sont affichées sur la fiche, en zone « détails »).
import { Plus, Trash2 } from 'lucide-react'
import type { MergeColumn } from '@/stores/merge.store'
import type { CustomField, CustomFieldMap } from '../promoTypes'

interface Props {
  customFields: CustomFieldMap
  columns: MergeColumn[]
  onChange: (next: CustomFieldMap) => void
}

function slugify(label: string, taken: Set<string>): string {
  const base = (label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'champ')
  let id = base, i = 2
  while (taken.has(id)) { id = `${base}-${i}`; i++ }
  return id
}

export function CustomFieldsEditor({ customFields, columns, onChange }: Props) {
  const update = (idx: number, patch: Partial<CustomField>) =>
    onChange(customFields.map((cf, i) => (i === idx ? { ...cf, ...patch } : cf)))
  // Choisir une colonne PRÉ-REMPLIT le nom (l'étiquette imprimée « Nom : valeur »)
  // s'il est encore vide — l'utilisateur garde la main pour le personnaliser.
  const pickColumn = (idx: number, key: string) => {
    const label = customFields[idx].label.trim()
      ? customFields[idx].label
      : (columns.find((c) => c.key === key)?.label || key).trim()
    update(idx, { column: key, label: key ? label : customFields[idx].label })
  }
  const remove = (idx: number) => onChange(customFields.filter((_, i) => i !== idx))
  const add = () => {
    const taken = new Set(customFields.map((c) => c.id))
    onChange([...customFields, { id: slugify('champ', taken), label: '', column: '' }])
  }

  return (
    <div className="space-y-2">
      {customFields.map((cf, idx) => (
        <div key={cf.id} className="flex items-center gap-2">
          <input value={cf.label} onChange={(e) => update(idx, { label: e.target.value })} placeholder="Nom du champ"
            className="w-32 px-2 py-1.5 rounded-md bg-surface-2 text-sm text-white outline-none focus:ring-1 focus:ring-indigo-600" />
          <select value={cf.column} onChange={(e) => pickColumn(idx, e.target.value)}
            className="flex-1 px-2 py-1.5 rounded-md bg-well border border-white/10 text-white text-sm outline-none focus:border-[#6366f1] [&>option]:bg-neutral-900">
            <option value="">(choisir une colonne)</option>
            {columns.map((c) => <option key={c.key} value={c.key}>{c.label || c.key}</option>)}
          </select>
          <button type="button" onClick={() => remove(idx)} title="Supprimer"
            className="p-1.5 rounded-md text-muted-foreground hover:text-white hover:bg-surface-2">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button type="button" onClick={add}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-white hover:bg-surface-2">
        <Plus className="w-3.5 h-3.5" /> Ajouter un champ
      </button>
    </div>
  )
}
