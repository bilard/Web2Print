// src/features/catalog/components/steps/CardStyleTypo.tsx
// Sous-panneau « typo » du style de fiches : échelle ET police pour CHAQUE champ
// texte mappé (nom, description, prix, marque, référence, unité, cartouche promo).
// « Police du thème » = hérite des polices du plan (titres ou texte selon le champ).
// Widgets du kit : SliderField (échelle) + <select> stylé inputCls (police).
import { useEffect, useRef } from 'react'
import { FontSelectOptions } from '@/features/fonts/FontSelectOptions'
import { SliderField, inputCls } from '@/components/shared/panel'
import type { CardObjectId, CatalogCardStyle } from '../../catalogTypes'

interface CardStyleTypoProps {
  style: CatalogCardStyle
  patch: (p: Partial<CatalogCardStyle>) => void
  /** Objet sélectionné dans l'aperçu (disposition libre) — surligne + focus la ligne correspondante. */
  selected?: CardObjectId | null
}

type ScaleKey = 'nameScale' | 'descScale' | 'priceScale' | 'brandScale' | 'refScale' | 'unitScale' | 'promoScale' | 'stickerScale' | 'vedetteScale' | 'detailsScale'
type FontKey = 'nameFont' | 'descFont' | 'priceFont' | 'brandFont' | 'refFont' | 'unitFont' | 'promoFont' | 'stickerFont' | 'vedetteFont' | 'detailsFont'

const FIELDS: { scale: ScaleKey; font: FontKey; label: string }[] = [
  { scale: 'nameScale', font: 'nameFont', label: 'Nom' },
  { scale: 'descScale', font: 'descFont', label: 'Description' },
  { scale: 'priceScale', font: 'priceFont', label: 'Prix' },
  { scale: 'brandScale', font: 'brandFont', label: 'Marque' },
  { scale: 'refScale', font: 'refFont', label: 'Référence' },
  { scale: 'unitScale', font: 'unitFont', label: 'Unité' },
  { scale: 'promoScale', font: 'promoFont', label: 'Cartouche promo' },
  { scale: 'stickerScale', font: 'stickerFont', label: 'Sticker remise' },
  { scale: 'vedetteScale', font: 'vedetteFont', label: 'Ruban vedette' },
  { scale: 'detailsScale', font: 'detailsFont', label: 'Détails' },
]

/** Objet de l'overlay « disposition libre » → champ d'échelle correspondant (image/kicker n'ont pas de curseur typo). */
const OBJ_TO_SCALE: Partial<Record<CardObjectId, ScaleKey>> = {
  name: 'nameScale', description: 'descScale', price: 'priceScale', brand: 'brandScale',
  ref: 'refScale', unit: 'unitScale', promo: 'promoScale', sticker: 'stickerScale',
  vedette: 'vedetteScale', details: 'detailsScale',
}

export function CardStyleTypo({ style, patch, selected }: CardStyleTypoProps) {
  const inputRefs = useRef<Partial<Record<ScaleKey, HTMLInputElement | null>>>({})
  const activeScale = selected != null ? OBJ_TO_SCALE[selected] : undefined

  useEffect(() => {
    if (!activeScale) return
    const el = inputRefs.current[activeScale]
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    el?.focus()
  }, [selected])

  return (
    <div className="grid grid-cols-1 gap-y-3">
      {FIELDS.map(({ scale, font, label }) => (
        <div key={scale} className={`space-y-1 ${scale === activeScale ? 'ring-2 ring-indigo-500 rounded-md' : ''}`}>
          <SliderField label={label} value={style[scale]} onChange={(v) => patch({ [scale]: v } as Partial<CatalogCardStyle>)}
            min={0.7} max={10} step={0.05} unit="×" inputRef={(el) => { inputRefs.current[scale] = el }} />
          <select value={style[font]} onChange={(e) => patch({ [font]: e.target.value } as Partial<CatalogCardStyle>)}
            className={inputCls}>
            <option value="">Police du thème</option>
            <FontSelectOptions />
          </select>
        </div>
      ))}
    </div>
  )
}
