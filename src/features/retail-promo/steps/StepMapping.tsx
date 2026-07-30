import { useRetailPromoStore } from '../retailPromo.store'
import type { PromoFieldKey } from '../promoTypes'
import { CustomFieldsEditor } from '../components/CustomFieldsEditor'
import { t, type TranslationKey } from '@/lib/i18n'

const FIELD_LABELS: Array<{ key: PromoFieldKey; labelKey: TranslationKey }> = [
  { key: 'name', labelKey: 'rp.map.name' },
  { key: 'image', labelKey: 'rp.map.image' },
  { key: 'brand', labelKey: 'rp.map.brand' },
  { key: 'ref', labelKey: 'rp.map.ref' },
  { key: 'ean', labelKey: 'rp.map.ean' },
  { key: 'newPrice', labelKey: 'rp.map.newPrice' },
  { key: 'oldPrice', labelKey: 'rp.map.oldPrice' },
  { key: 'unitPrice', labelKey: 'rp.map.unitPrice' },
  { key: 'unit', labelKey: 'rp.map.unit' },
  { key: 'description', labelKey: 'rp.map.description' },
  { key: 'category', labelKey: 'rp.map.category' },
  { key: 'promoLabel', labelKey: 'rp.map.promoLabel' },
  { key: 'validFrom', labelKey: 'rp.map.validFrom' },
  { key: 'validTo', labelKey: 'rp.map.validTo' },
  { key: 'mentions', labelKey: 'rp.map.mentions' },
  { key: 'enseigne', labelKey: 'rp.map.enseigne' },
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
        <span className="text-[#6366f1]">promo_*</span> {t('rp.map.autoComputed')}
      </p>

      <div className="flex flex-col gap-2">
        {FIELD_LABELS.map(({ key, labelKey }) => (
          <div key={key} className="flex items-center gap-3">
            <span className="w-36 text-sm text-white/70 shrink-0">{t(labelKey)}</span>
            <select
              value={fieldMap[key] ?? ''}
              onChange={(e) => handleChange(key, e.target.value)}
              className="flex-1 px-2 py-1.5 rounded-lg bg-well border border-white/10 text-white text-sm outline-none focus:border-[#6366f1] [&>option]:bg-neutral-900"
            >
              <option value="">{t('rp.map.unmapped')}</option>
              {rawColumns.map((c) => (
                <option key={c.key} value={c.key}>{c.label || c.key}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div>
        <div className="text-xs font-semibold text-white/70 uppercase tracking-wide mb-2">{t('rp.map.extraFields')}</div>
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
