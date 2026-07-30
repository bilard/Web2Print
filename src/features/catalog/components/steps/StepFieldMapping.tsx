// Carte « Correspondance des champs » de l'étape Structure : associe chaque champ
// de FICHE (nom/image/prix…) à une colonne source, et gère les champs libres.
// Le devinage reste le défaut ; un choix ici pose un override qui prime et survit.
import { Link2 } from 'lucide-react'
import { useCatalogStore } from '@/stores/catalog.store'
import type { PromoFieldKey } from '@/features/retail-promo/promoTypes'
import { CustomFieldsEditor } from '@/features/retail-promo/components/CustomFieldsEditor'
import { t } from '@/lib/i18n'

const FIELDS: { key: PromoFieldKey; label: string }[] = [
  { key: 'name', label: 'Nom' },
  { key: 'image', label: 'Image' },
  { key: 'newPrice', label: 'Prix' },
  { key: 'oldPrice', label: 'Prix barré' },
  { key: 'brand', label: 'Marque' },
  { key: 'ref', label: 'Référence' },
  { key: 'unit', label: 'Unité' },
  { key: 'description', label: 'Description' },
]

const selectClass = 'w-full px-3 py-1.5 rounded-md bg-surface-2 text-sm text-white outline-none focus:ring-1 focus:ring-indigo-600'

export function StepFieldMapping() {
  const rawColumns = useCatalogStore((s) => s.rawColumns)
  const fieldMap = useCatalogStore((s) => s.fieldMap)
  const overrides = useCatalogStore((s) => s.fieldMapOverrides)
  const setFieldMapOverride = useCatalogStore((s) => s.setFieldMapOverride)
  const customFields = useCatalogStore((s) => s.customFields)
  const setCustomFields = useCatalogStore((s) => s.setCustomFields)

  return (
    <section className="rounded-lg border border-border bg-surface p-4 space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
        <Link2 className="w-4 h-4 text-indigo-400" /> Correspondance des champs
      </h2>
      <p className="text-xs text-muted-foreground">Les champs sont devinés automatiquement ; corrigez une colonne au besoin (votre choix est conservé).</p>
      <div className="grid grid-cols-2 gap-3">
        {FIELDS.map(({ key, label }) => (
          <div key={key} className="space-y-1">
            <label className="flex items-center justify-between text-xs text-muted-foreground">
              {label}
              {overrides[key] && (
                <button type="button" onClick={() => setFieldMapOverride(key, null)} className="text-[10px] text-indigo-400 hover:text-indigo-300">Auto</button>
              )}
            </label>
            <select value={fieldMap[key] ?? ''} onChange={(e) => setFieldMapOverride(key, e.target.value || null)} className={selectClass}>
              <option value="">{t('cat.map.unmapped')}</option>
              {rawColumns.map((c) => <option key={c.key} value={c.key}>{c.label || c.key}</option>)}
            </select>
          </div>
        ))}
      </div>
      <div className="pt-1">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t('cat.map.extraFields')}</div>
        <CustomFieldsEditor customFields={customFields} columns={rawColumns} onChange={setCustomFields} />
      </div>
    </section>
  )
}
