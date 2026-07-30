import { useRetailPromoStore } from './retailPromo.store'
import { PROMO_LAYOUTS } from './promoCardTypes'
import { t } from '@/lib/i18n'

/** Sélecteur de variante de mise en page (structure graphique). */
export function PromoLayoutPicker() {
  const { config, setConfig } = useRetailPromoStore()
  const current = config.layout ?? 'classique'
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-white/5 pt-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-white/40">{t('rp.miseEnPage')}</span>
      <div className="flex flex-wrap gap-1.5">
        {PROMO_LAYOUTS.map((l) => (
          <button
            key={l.id}
            onClick={() => setConfig({ layout: l.id })}
            title={t(l.hintKey)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              current === l.id ? 'bg-[#6366f1] text-[#fff]' : 'bg-white/[0.06] text-white/70 hover:bg-white/10'
            }`}
          >
            {t(l.labelKey)}
          </button>
        ))}
      </div>
    </div>
  )
}
