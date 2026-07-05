// src/features/catalog/components/steps/CardStyleTypo.tsx
// Sous-panneau « typo » du style de fiches : échelle ET police pour CHAQUE champ
// texte mappé (nom, description, prix, marque, référence, unité, cartouche promo).
// « Police du thème » = hérite des polices du plan (titres ou texte selon le champ).
// Widgets du kit : SliderField (échelle) + <select> stylé inputCls (police).
import { useEffect, useRef } from 'react'
import { FontSelectOptions } from '@/features/fonts/FontSelectOptions'
import { SliderField, inputCls } from '@/components/shared/panel'
import { CARD_OBJECT_IDS, type CardObjectId, type CatalogCardStyle } from '../../catalogTypes'
import { freeLayoutBox } from '../pages/freeLayout'

interface CardStyleTypoProps {
  style: CatalogCardStyle
  patch: (p: Partial<CatalogCardStyle>) => void
  /** Objet sélectionné dans l'aperçu (disposition libre) — surligne + focus la ligne correspondante. */
  selected?: CardObjectId | null
}

type ScaleKey = 'nameScale' | 'descScale' | 'priceScale' | 'brandScale' | 'refScale' | 'unitScale' | 'promoScale' | 'stickerScale' | 'vedetteScale' | 'detailsScale'
type FontKey = 'nameFont' | 'descFont' | 'priceFont' | 'brandFont' | 'refFont' | 'unitFont' | 'promoFont' | 'stickerFont' | 'vedetteFont' | 'detailsFont'

const FIELDS: { scale: ScaleKey; font: FontKey; label: string; obj: CardObjectId }[] = [
  { scale: 'nameScale', font: 'nameFont', label: 'Nom', obj: 'name' },
  { scale: 'descScale', font: 'descFont', label: 'Description', obj: 'description' },
  { scale: 'priceScale', font: 'priceFont', label: 'Prix', obj: 'price' },
  { scale: 'brandScale', font: 'brandFont', label: 'Marque', obj: 'brand' },
  { scale: 'refScale', font: 'refFont', label: 'Référence', obj: 'ref' },
  { scale: 'unitScale', font: 'unitFont', label: 'Unité', obj: 'unit' },
  { scale: 'promoScale', font: 'promoFont', label: 'Cartouche promo', obj: 'promo' },
  { scale: 'stickerScale', font: 'stickerFont', label: 'Sticker remise', obj: 'sticker' },
  { scale: 'vedetteScale', font: 'vedetteFont', label: 'Ruban vedette', obj: 'vedette' },
  { scale: 'detailsScale', font: 'detailsFont', label: 'Détails', obj: 'details' },
]

/** Nom d'affichage de chaque bloc (options du sélecteur de liaison). */
const OBJ_LABEL: Record<CardObjectId, string> = {
  promo: 'Cartouche promo', vedette: 'Ruban vedette', kicker: 'Sous-famille', image: 'Image',
  sticker: 'Sticker remise', brand: 'Marque', name: 'Nom', description: 'Description',
  ref: 'Référence', unit: 'Unité', details: 'Détails', price: 'Prix',
}

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

  // Liaison entre blocs (disposition libre) : le bloc est SOUDÉ à droite de sa
  // cible et la suit partout. Éditable ici pour VOIR tous les liens d'un coup.
  const setLink = (obj: CardObjectId, target: string) => {
    const box = { ...freeLayoutBox(obj, style), link: (target || undefined) as CardObjectId | undefined }
    patch({ layout: { ...style.layout, [obj]: box } })
  }

  return (
    <div className="grid grid-cols-1 gap-y-3">
      {FIELDS.map(({ scale, font, label, obj }) => {
        const link = style.freeLayout ? freeLayoutBox(obj, style).link : undefined
        return (
          <div key={scale} className={`space-y-1 ${scale === activeScale ? 'ring-2 ring-indigo-500 rounded-md' : ''}`}>
            <SliderField label={label} value={style[scale]} onChange={(v) => patch({ [scale]: v } as Partial<CatalogCardStyle>)}
              min={0.7} max={10} step={0.05} unit="×" inputRef={(el) => { inputRefs.current[scale] = el }} />
            <select value={style[font]} onChange={(e) => patch({ [font]: e.target.value } as Partial<CatalogCardStyle>)}
              className={inputCls}>
              <option value="">Police du thème</option>
              <FontSelectOptions />
            </select>
            {style.freeLayout && (
              <label className={`flex items-center gap-1.5 text-[10px] ${link ? 'text-indigo-300' : 'text-white/30'}`}
                title="Liaison : ce bloc est soudé à DROITE du bloc choisi et le suit partout">
                🔗
                <select value={link ?? ''} onChange={(e) => setLink(obj, e.target.value)}
                  className={`${inputCls} !py-0.5 !text-[10px]`}>
                  <option value="">Non lié</option>
                  {CARD_OBJECT_IDS.filter((t) => t !== obj).map((t) => (
                    <option key={t} value={t}>Lié à : {OBJ_LABEL[t]}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )
      })}
    </div>
  )
}
