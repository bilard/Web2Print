// src/features/catalog/components/steps/CardStyleTypo.tsx
// Sous-panneau « typo » du style de fiches : échelle ET police pour CHAQUE champ
// texte mappé (nom, description, prix, marque, référence, unité, cartouche promo).
// « Police du thème » = hérite des polices du plan (titres ou texte selon le champ).
import { FONT_OPTIONS } from '@/features/retail-promo/RetailPromoCard'
import { useUserFonts } from '@/features/fonts/useUserFonts'
import type { CatalogCardStyle } from '../../catalogTypes'

interface CardStyleTypoProps {
  style: CatalogCardStyle
  patch: (p: Partial<CatalogCardStyle>) => void
}

type ScaleKey = 'nameScale' | 'descScale' | 'priceScale' | 'brandScale' | 'refScale' | 'unitScale' | 'promoScale' | 'stickerScale'
type FontKey = 'nameFont' | 'descFont' | 'priceFont' | 'brandFont' | 'refFont' | 'unitFont' | 'promoFont' | 'stickerFont'

const FIELDS: { scale: ScaleKey; font: FontKey; label: string }[] = [
  { scale: 'nameScale', font: 'nameFont', label: 'Nom' },
  { scale: 'descScale', font: 'descFont', label: 'Description' },
  { scale: 'priceScale', font: 'priceFont', label: 'Prix' },
  { scale: 'brandScale', font: 'brandFont', label: 'Marque' },
  { scale: 'refScale', font: 'refFont', label: 'Référence' },
  { scale: 'unitScale', font: 'unitFont', label: 'Unité' },
  { scale: 'promoScale', font: 'promoFont', label: 'Cartouche promo' },
  { scale: 'stickerScale', font: 'stickerFont', label: 'Sticker remise' },
]

export function CardStyleTypo({ style, patch }: CardStyleTypoProps) {
  const { fonts: userFonts } = useUserFonts()
  return (
    <div>
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Texte : taille & police par champ</div>
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-x-4 gap-y-3">
        {FIELDS.map(({ scale, font, label }) => (
          <div key={scale} className="space-y-1">
            <label className="block text-xs text-muted-foreground space-y-1">
              <span className="flex justify-between">{label}<b className="text-white tabular-nums">×{style[scale].toFixed(2)}</b></span>
              <input type="range" min={0.7} max={1.5} step={0.05} value={style[scale]}
                onChange={(e) => patch({ [scale]: Number(e.target.value) } as Partial<CatalogCardStyle>)}
                className="w-full accent-indigo-600" />
            </label>
            <select value={style[font]} onChange={(e) => patch({ [font]: e.target.value } as Partial<CatalogCardStyle>)}
              className="w-full px-2 py-1 rounded-md bg-surface-2 text-xs text-white outline-none focus:ring-1 focus:ring-indigo-600">
              <option value="">Police du thème</option>
              {userFonts.length > 0 && (
                <optgroup label="Mes polices">
                  {userFonts.map((f) => <option key={f.id} value={f.family}>{f.family}</option>)}
                </optgroup>
              )}
              <optgroup label="Google Fonts">
                {FONT_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
              </optgroup>
            </select>
          </div>
        ))}
      </div>
    </div>
  )
}
