import { Plus, Trash2 } from 'lucide-react'
import type { ScrapingField } from './useJina'

interface Props {
  fields: ScrapingField[]
  onChange: (fields: ScrapingField[]) => void
}

export function SchemaEditor({ fields, onChange }: Props) {
  const add = () => {
    const key = `field_${Date.now()}`
    onChange([...fields, { key, label: '', description: '', type: 'string' }])
  }

  const update = (i: number, patch: Partial<ScrapingField>) => {
    onChange(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)))
  }

  const remove = (i: number) => onChange(fields.filter((_, idx) => idx !== i))

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-white/30 uppercase tracking-wider">Champs à extraire</span>
        <button
          onClick={add}
          className="flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors"
        >
          <Plus className="w-3 h-3" />
          Ajouter
        </button>
      </div>

      {fields.length === 0 && (
        <p className="text-[11px] text-white/20 text-center py-3">
          Aucun champ — le mode auto sera utilisé
        </p>
      )}

      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
        {fields.map((f, i) => (
          <div key={f.key} className="bg-black/20 rounded-lg p-2.5 space-y-1.5">
            <div className="flex items-center gap-2">
              <input
                value={f.label}
                onChange={(e) => update(i, { label: e.target.value, key: e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') })}
                placeholder="Nom du champ"
                className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white placeholder:text-white/20 focus:border-indigo-500/50 focus:outline-none"
              />
              <select
                value={f.type}
                onChange={(e) => update(i, { type: e.target.value as ScrapingField['type'] })}
                className="w-24 bg-white/5 border border-white/10 rounded px-1.5 py-1 text-xs text-white/70 focus:border-indigo-500/50 focus:outline-none"
              >
                <option value="string">Texte</option>
                <option value="strings">Liste de textes</option>
                <option value="number">Nombre</option>
                <option value="boolean">Bool</option>
                <option value="dict">Dictionnaire</option>
                <option value="specs">Specs (tableau)</option>
              </select>
              <button onClick={() => remove(i)} className="p-1 text-white/20 hover:text-red-400 transition-colors">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
            <input
              value={f.description}
              onChange={(e) => update(i, { description: e.target.value })}
              placeholder="Description (aide l'IA à extraire)"
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[11px] text-white/60 placeholder:text-white/20 focus:border-indigo-500/50 focus:outline-none"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
