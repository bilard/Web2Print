import { useMergeStore } from '@/stores/merge.store'
import { useShallow } from 'zustand/react/shallow'
import { globalFabricCanvas } from '@/features/editor/globalCanvas'
import { collectObjectsDeep } from '@/features/editor/deepObjects'
import { variableMatchesColumn } from './mergeEngine'

/** Toutes les balises utilisées dans le design (mergeFields IDML + {{var}} manuels), dédupliquées. */
function collectDesignFields(): string[] {
  const canvas = globalFabricCanvas
  if (!canvas) return []
  const set = new Set<string>()
  for (const o of collectObjectsDeep(canvas.getObjects())) {
    const fields = (o as { data?: { mergeFields?: string[] } }).data?.mergeFields
    fields?.forEach((f) => set.add(f))
    const data = (o as { data?: { templateText?: string }; text?: string })
    const txt = data.data?.templateText ?? data.text ?? ''
    for (const m of txt.matchAll(/\{\{([^}]+)\}\}/g)) set.add(m[1])
  }
  return Array.from(set)
}

/**
 * Section « Mapping des champs » du panneau Données : pour chaque balise du design, un sélecteur
 * de colonne. Le choix (fieldMap) est consulté en priorité par la fusion (cf. mergeEngine).
 */
export function FieldMappingEditor() {
  const { columns, fieldMap, setFieldMap, isConnected } = useMergeStore(
    useShallow((s) => ({
      columns: s.columns,
      fieldMap: s.fieldMap,
      setFieldMap: s.setFieldMap,
      isConnected: s.isConnected,
    })),
  )
  if (!isConnected) return null
  const fields = collectDesignFields()
  if (fields.length === 0) return null

  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[10px] font-semibold text-white/40 uppercase tracking-wider px-1">
        Mapping des champs
      </div>
      {fields.map((field) => {
        const resolved = variableMatchesColumn(field, columns, fieldMap)
        return (
          <div key={field} className="flex items-center gap-2 px-1">
            <span
              className={`text-[11px] w-2 shrink-0 ${resolved ? 'text-emerald-400' : 'text-amber-400'}`}
              title={resolved ? 'Champ résolu' : 'Aucune colonne — choisis-en une'}
            >
              {resolved ? '✓' : '⚠'}
            </span>
            <span className="text-[12px] text-white/80 flex-1 truncate" title={field}>
              {field}
            </span>
            <select
              value={fieldMap[field] ?? ''}
              onChange={(e) => setFieldMap(field, e.target.value)}
              className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded px-2 py-1 text-[11px] text-white"
            >
              <option value="">— auto (devinette) —</option>
              {columns.map((col) => (
                <option key={col.key} value={col.key}>
                  {col.label}
                </option>
              ))}
            </select>
          </div>
        )
      })}
    </div>
  )
}
