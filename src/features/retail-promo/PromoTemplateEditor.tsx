import { useRetailPromoStore } from './retailPromo.store'
import type { PromoTemplateConfig } from './RetailPromoCard'

const TOGGLES: Array<{ key: keyof PromoTemplateConfig; label: string }> = [
  { key: 'showCategory', label: 'Catégorie' },
  { key: 'showDescription', label: 'Description' },
  { key: 'showUnitPrice', label: 'Prix unitaire' },
  { key: 'showBadge', label: 'Badge remise' },
  { key: 'showFooter', label: 'Pied de page' },
]

/** Panneau d'édition du template : couleurs + champs affichés (aperçu live). */
export function PromoTemplateEditor() {
  const { config, setConfig } = useRetailPromoStore()
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-white/10 bg-surface px-4 py-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-white/40">Habillage</span>
      <label className="flex items-center gap-2 text-sm text-white/70">
        Accent
        <input type="color" value={config.accent} onChange={(e) => setConfig({ accent: e.target.value })}
          className="h-6 w-8 cursor-pointer rounded border border-white/10 bg-transparent p-0" />
      </label>
      <label className="flex items-center gap-2 text-sm text-white/70">
        En-tête
        <input type="color" value={config.headerBg} onChange={(e) => setConfig({ headerBg: e.target.value })}
          className="h-6 w-8 cursor-pointer rounded border border-white/10 bg-transparent p-0" />
      </label>
      <span className="h-4 w-px bg-white/10" />
      {TOGGLES.map(({ key, label }) => (
        <label key={key} className="flex items-center gap-1.5 text-sm text-white/70">
          <input type="checkbox" checked={config[key] as boolean} onChange={(e) => setConfig({ [key]: e.target.checked })}
            className="accent-[#6366f1]" />
          {label}
        </label>
      ))}
    </div>
  )
}
