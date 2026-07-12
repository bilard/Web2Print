// src/features/catalog/components/steps/CardStyleVisibility.tsx
// Liste « Éléments affichés » du panneau Style des fiches : TOUS les objets de
// la fiche (image, marque, nom, prix, prix barré compris) + les champs libres
// (TVA, entretien…) masquables UN PAR UN sous « Détails ».
import { useMemo } from 'react'
import { useCatalogStore } from '@/stores/catalog.store'
import { MAX_SPEC_LINES, MAX_BULLET_ITEMS, UNCAPPED, isSpecsDetailField, extractPromoFields, countDetailData } from '@/features/retail-promo/promoMapping'
import type { CatalogCardStyle } from '../../catalogTypes'

type ShowKey = keyof Pick<CatalogCardStyle,
  'showPromo' | 'showImage' | 'showSticker' | 'showKicker' | 'showVedette' | 'showBrand' | 'showName'
  | 'showDesc' | 'showRef' | 'showUnit' | 'showPrice' | 'showWas' | 'showDetails'>

/** Ordre = ordre visuel de la fiche (conventions retail). */
const VISIBILITY: { key: ShowKey; label: string }[] = [
  { key: 'showPromo', label: 'Cartouche promo' },
  { key: 'showImage', label: 'Image' },
  { key: 'showSticker', label: 'Sticker remise' },
  { key: 'showKicker', label: 'Sous-famille' },
  { key: 'showVedette', label: 'Ruban vedette' },
  { key: 'showBrand', label: 'Marque' },
  { key: 'showName', label: 'Nom' },
  { key: 'showDesc', label: 'Description' },
  { key: 'showRef', label: 'Référence' },
  { key: 'showUnit', label: 'Unité' },
  { key: 'showPrice', label: 'Prix' },
  { key: 'showWas', label: 'Prix barré' },
  { key: 'showDetails', label: 'Détails' },
]

interface Props {
  style: CatalogCardStyle
  patch: (p: Partial<CatalogCardStyle>) => void
}

export function CardStyleVisibility({ style, patch }: Props) {
  // Champs libres du catalogue (TVA, avantages…) : une case par champ, indentée
  // sous « Détails » — masquer un champ retire SA ligne de la zone, pas la zone.
  const customFields = useCatalogStore((s) => s.customFields)
  const rawRows = useCatalogStore((s) => s.rawRows)
  const rawColumns = useCatalogStore((s) => s.rawColumns)
  const fieldMap = useCatalogStore((s) => s.fieldMap)
  const selectedRowIds = useCatalogStore((s) => s.selectedRowIds)
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

  return (
    <div className="flex flex-col gap-2">
      {VISIBILITY.map(({ key, label }) => (
        <div key={key}>
          <label className="flex items-center gap-1.5 text-xs text-white/40 cursor-pointer select-none">
            <input type="checkbox" checked={style[key]} onChange={(e) => patch({ [key]: e.target.checked } as Partial<CatalogCardStyle>)}
              className="accent-indigo-600" />
            {label}
          </label>
          {key === 'showDetails' && style.showDetails && customFields.length > 0 && (
            <div className="flex flex-col gap-1.5 mt-1.5 ml-5 pl-2 border-l border-white/10">
              {customFields.map((cf) => (
                <label key={cf.id} className="flex items-center gap-1.5 text-[11px] text-white/40 cursor-pointer select-none">
                  <input type="checkbox" checked={!hidden.includes(cf.id)} onChange={(e) => toggleDetail(cf.id, e.target.checked)}
                    className="accent-indigo-600" />
                  {(cf.label || cf.column || 'Champ').trim()}
                </label>
              ))}
              <label className="flex items-center gap-1.5 text-[11px] text-white/40 select-none">
                Puces max (par champ)
                <input type="number" min={1} max={UNCAPPED} value={style.maxBulletLines ?? MAX_BULLET_ITEMS}
                  onChange={(e) => patch({ maxBulletLines: Math.max(1, Math.min(UNCAPPED, Number(e.target.value) || 1)) })}
                  className="w-14 px-2 py-0.5 rounded-md bg-well text-[11px] text-white outline-none border border-white/10 focus:border-[#6366f1]" />
              </label>
              {hasSpecsField && (
                <label className="flex items-center gap-1.5 text-[11px] text-white/40 select-none">
                  Spécifications max
                  <input type="number" min={0} max={UNCAPPED} value={style.maxSpecLines ?? MAX_SPEC_LINES}
                    onChange={(e) => patch({ maxSpecLines: Math.max(0, Math.min(UNCAPPED, Number(e.target.value) || 0)) })}
                    className="w-14 px-2 py-0.5 rounded-md bg-well text-[11px] text-white outline-none border border-white/10 focus:border-[#6366f1]" />
                </label>
              )}
              {(() => {
                const auto = (style.maxBulletLines ?? MAX_BULLET_ITEMS) >= autoCounts.bullets
                  && (style.maxSpecLines ?? MAX_SPEC_LINES) >= autoCounts.specs
                return (
                  <button type="button"
                    onClick={() => patch(auto
                      ? { maxBulletLines: MAX_BULLET_ITEMS, maxSpecLines: MAX_SPEC_LINES }
                      : { maxBulletLines: autoCounts.bullets, maxSpecLines: autoCounts.specs })}
                    title="Règle les plafonds sur les comptes RÉELS des produits sélectionnés (tout est affiché, sans abrégé) — re-cliquer = revenir aux plafonds par défaut"
                    className={`w-full px-2 py-1 rounded-md text-[11px] font-medium border transition-colors ${
                      auto ? 'bg-indigo-600 border-indigo-500 text-[#fff]' : 'bg-well border-white/10 text-white/60 hover:text-white'
                    }`}>
                    {auto
                      ? `✓ Auto — tout est affiché (${autoCounts.bullets} puces · ${autoCounts.specs} specs)`
                      : `Auto — tout afficher (${autoCounts.bullets} puces · ${autoCounts.specs} specs)`}
                  </button>
                )
              })()}
            </div>
          )}
        </div>
      ))}
      <label className="flex items-center gap-1.5 text-xs text-white/40">
        Texte du ruban
        <input value={style.vedetteLabel} onChange={(e) => patch({ vedetteLabel: e.target.value })} placeholder="Vedette"
          className="w-28 px-2 py-1 rounded-md bg-well text-xs text-white outline-none border border-white/10 focus:border-[#6366f1]" />
      </label>
    </div>
  )
}
