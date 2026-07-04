import { useRetailPromoStore } from '../retailPromo.store'
import type { PromoFieldKey } from '../promoTypes'
import { CustomFieldsEditor } from '../components/CustomFieldsEditor'

const FIELD_LABELS: Array<{ key: PromoFieldKey; label: string }> = [
  { key: 'name', label: 'Nom produit' },
  { key: 'image', label: 'Image' },
  { key: 'brand', label: 'Marque' },
  { key: 'ref', label: 'Référence / SKU' },
  { key: 'ean', label: 'EAN / Code-barres' },
  { key: 'newPrice', label: 'Prix promo' },
  { key: 'oldPrice', label: 'Prix barré' },
  { key: 'unitPrice', label: 'Prix unitaire' },
  { key: 'unit', label: 'Unité (ex: /kg)' },
  { key: 'description', label: 'Description' },
  { key: 'category', label: 'Catégorie' },
  { key: 'promoLabel', label: 'Mécanique promo' },
  { key: 'validFrom', label: 'Date début' },
  { key: 'validTo', label: 'Date fin' },
  { key: 'mentions', label: 'Mentions légales' },
  { key: 'enseigne', label: 'Enseigne / Magasin' },
]

export function StepMapping() {
  const { rawColumns, fieldMap, setFieldMap, setStep, customFields, setCustomFields } = useRetailPromoStore()

  const handleChange = (promoKey: PromoFieldKey, colKey: string) => {
    setFieldMap({ ...fieldMap, [promoKey]: colKey || undefined } as typeof fieldMap)
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-white">Correspondance des champs</h2>
      <p className="text-sm text-white/60">
        Associez chaque champ promo à la colonne de votre source. Les champs{' '}
        <span className="text-[#6366f1]">promo_*</span> sont calculés automatiquement.
      </p>

      <div className="flex flex-col gap-2">
        {FIELD_LABELS.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-3">
            <span className="w-36 text-sm text-white/70 shrink-0">{label}</span>
            <select
              value={fieldMap[key] ?? ''}
              onChange={(e) => handleChange(key, e.target.value)}
              className="flex-1 px-2 py-1.5 rounded-lg bg-well border border-white/10 text-white text-sm outline-none focus:border-[#6366f1] [&>option]:bg-neutral-900"
            >
              <option value="">(non mappé)</option>
              {rawColumns.map((c) => (
                <option key={c.key} value={c.key}>{c.label || c.key}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div>
        <div className="text-xs font-semibold text-white/70 uppercase tracking-wide mb-2">Champs supplémentaires</div>
        <CustomFieldsEditor customFields={customFields} columns={rawColumns} onChange={setCustomFields} />
      </div>

      {rawColumns.length === 0 && (
        <p className="text-amber-400/80 text-sm">Aucune colonne source disponible.</p>
      )}

      <div className="flex gap-3 mt-2">
        <button
          onClick={() => setStep('source')}
          className="px-4 py-2 rounded-lg border border-white/10 text-white/70 text-sm hover:text-white hover:border-white/30 transition-colors"
        >
          Retour
        </button>
        <button
          onClick={() => setStep('template')}
          disabled={rawColumns.length === 0}
          className="flex-1 px-4 py-2 rounded-lg bg-[#6366f1] text-[#fff] font-medium text-sm disabled:opacity-40 transition-opacity"
        >
          Choisir le gabarit →
        </button>
      </div>
    </div>
  )
}
