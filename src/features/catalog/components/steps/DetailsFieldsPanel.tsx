// Sous-bloc « Détails » de la liste « Éléments affichés » : une case par champ
// libre du catalogue (TVA, avantages…), quotas de puces/specs et les deux modes
// rapides Exhaustif / Condensé (mode ↔ densité de grille couplés).
import { useMemo } from 'react'
import { toast } from 'sonner'
import { useCatalogStore } from '@/stores/catalog.store'
import { UNCAPPED, isSpecsDetailField, extractPromoFields, countDetailData } from '@/features/retail-promo/promoMapping'
import type { CatalogCardStyle } from '../../catalogTypes'
import { t } from '@/lib/i18n'

interface Props {
  style: CatalogCardStyle
  patch: (p: Partial<CatalogCardStyle>) => void
}

const numField = 'w-16 px-2 py-0.5 rounded-md bg-well text-[11px] text-white outline-none border border-white/10 focus:border-[#6366f1] placeholder:text-white/25'

export function DetailsFieldsPanel({ style, patch }: Props) {
  const customFields = useCatalogStore((s) => s.customFields)
  const rawRows = useCatalogStore((s) => s.rawRows)
  const rawColumns = useCatalogStore((s) => s.rawColumns)
  const fieldMap = useCatalogStore((s) => s.fieldMap)
  const selectedRowIds = useCatalogStore((s) => s.selectedRowIds)
  const plan = useCatalogStore((s) => s.plan)
  const setPlan = useCatalogStore((s) => s.setPlan)
  /** Couplage mode ↔ densité : l'exhaustif n'est visible qu'avec de GRANDES cartes. */
  const setAllSectionsGrid = (grid: 2 | 4) => {
    if (!plan) return
    setPlan({ ...plan, sections: plan.sections.map((sec) => ({ ...sec, productsPerPage: grid, randomDensity: false })) })
  }
  const hidden = style.hiddenDetails ?? []
  const hasSpecsField = customFields.some(isSpecsDetailField)
  // Comptes RÉELS pour « Auto » : maximum de puces / de specs parmi les
  // produits SÉLECTIONNÉS — les champs affichent alors le nombre exact.
  const autoCounts = useMemo(() => {
    const sel = new Set(selectedRowIds)
    let bullets = 0
    let specs = 0
    for (const row of rawRows) {
      if (sel.size > 0 && !sel.has(row._id)) continue
      const c = countDetailData(customFields, extractPromoFields(row, rawColumns, fieldMap, customFields))
      bullets = Math.max(bullets, c.bullets)
      specs = Math.max(specs, c.specs)
    }
    return { bullets: Math.max(1, bullets), specs }
  }, [rawRows, rawColumns, fieldMap, customFields, selectedRowIds])
  const toggleDetail = (id: string, visible: boolean) =>
    patch({ hiddenDetails: visible ? hidden.filter((h) => h !== id) : [...hidden, id] })
  const exhaustive = (style.maxBulletLines ?? UNCAPPED) >= autoCounts.bullets
    && (style.maxSpecLines ?? UNCAPPED) >= autoCounts.specs
  const on = 'bg-indigo-600 border-indigo-500 text-[#fff]'
  const off = 'bg-well border-white/10 text-white/60 hover:text-white'

  return (
    <div className="flex flex-col gap-1.5 mt-1.5 ml-1 pl-2 border-l border-white/10">
      {customFields.map((cf) => (
        <label key={cf.id} className="flex items-center gap-1.5 text-[11px] text-white/40 cursor-pointer select-none">
          <input type="checkbox" checked={!hidden.includes(cf.id)} onChange={(e) => toggleDetail(cf.id, e.target.checked)}
            className="accent-indigo-600" />
          {(cf.label || cf.column || 'Champ').trim()}
        </label>
      ))}
      <label className="flex items-center gap-1.5 text-[11px] text-white/40 select-none">
        Puces max (vide = toutes)
        <input type="number" min={1} max={UNCAPPED} placeholder="toutes"
          value={style.maxBulletLines != null && style.maxBulletLines < UNCAPPED ? style.maxBulletLines : ''}
          onChange={(e) => patch({ maxBulletLines: e.target.value === '' ? UNCAPPED : Math.max(1, Math.min(UNCAPPED, Number(e.target.value) || 1)) })}
          className={numField} />
      </label>
      {hasSpecsField && (
        <label className="flex items-center gap-1.5 text-[11px] text-white/40 select-none">
          Spécifications max (vide = toutes)
          <input type="number" min={0} max={UNCAPPED} placeholder="toutes"
            value={style.maxSpecLines != null && style.maxSpecLines < UNCAPPED ? style.maxSpecLines : ''}
            onChange={(e) => patch({ maxSpecLines: e.target.value === '' ? UNCAPPED : Math.max(0, Math.min(UNCAPPED, Number(e.target.value) || 0)) })}
            className={numField} />
        </label>
      )}
      <div className="space-y-1">
        <div className="flex gap-1.5">
          <button type="button"
            onClick={() => {
              patch({ maxBulletLines: UNCAPPED, maxSpecLines: UNCAPPED })
              setAllSectionsGrid(2)
              toast.success('Mode EXHAUSTIF : toute la donnée source + grandes cartes (2 produits/page) sur toutes les sections', {
                description: 'Densité ajustable section par section dans le panneau Sections.',
              })
            }}
            title={t('cat.details.full')}
            className={`flex-1 px-2 py-1 rounded-md text-[11px] font-medium border transition-colors ${exhaustive ? on : off}`}>
            {exhaustive ? '✓ Exhaustif' : 'Exhaustif'}
          </button>
          <button type="button"
            onClick={() => {
              patch({ maxBulletLines: 5, maxSpecLines: 6 })
              setAllSectionsGrid(4)
              toast.success('Mode CONDENSÉ : 5 puces · 6 specs + grille 4 produits/page', {
                description: 'Quotas ajustables dans les champs, densité dans le panneau Sections.',
              })
            }}
            title={t('cat.details.condensed')}
            className={`flex-1 px-2 py-1 rounded-md text-[11px] font-medium border transition-colors ${!exhaustive ? on : off}`}>
            {!exhaustive ? '✓ Condensé' : 'Condensé'}
          </button>
        </div>
        <p className="text-[10px] text-white/35">
          Data source : {autoCounts.bullets} puce(s) · {autoCounts.specs} spec(s) max par fiche
        </p>
      </div>
    </div>
  )
}
