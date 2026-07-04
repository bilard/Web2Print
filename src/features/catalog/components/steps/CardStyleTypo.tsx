// src/features/catalog/components/steps/CardStyleTypo.tsx
// Sous-panneau « typo » du style de fiches : échelle ET police pour CHAQUE champ
// texte mappé (nom, description, prix, marque, référence, unité, cartouche promo).
// « Police du thème » = hérite des polices du plan (titres ou texte selon le champ).
// Widgets du kit : SliderField (échelle) + <select> stylé inputCls (police).
import { FontSelectOptions } from '@/features/fonts/FontSelectOptions'
import { SliderField, inputCls } from '@/components/shared/panel'
import type { CatalogCardStyle } from '../../catalogTypes'

interface CardStyleTypoProps {
  style: CatalogCardStyle
  patch: (p: Partial<CatalogCardStyle>) => void
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

export function CardStyleTypo({ style, patch }: CardStyleTypoProps) {
  return (
    <div className="grid grid-cols-2 xl:grid-cols-3 gap-x-4 gap-y-3">
      {FIELDS.map(({ scale, font, label }) => (
        <div key={scale} className="space-y-1">
          <SliderField label={label} value={style[scale]} onChange={(v) => patch({ [scale]: v } as Partial<CatalogCardStyle>)}
            min={0.7} max={1.5} step={0.05} unit="×" />
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
