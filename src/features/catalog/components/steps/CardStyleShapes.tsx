// src/features/catalog/components/steps/CardStyleShapes.tsx
// Réglages FORMES des badges (prix, sticker de remise) : forme du container +
// inclinaison — appliqués en variables CSS (--cat-price-radius/rot,
// --cat-sticker-radius/rot) par-dessus le template fluide, comme le reste.
import { SliderField, inputCls } from '@/components/shared/panel'
import type { CatalogCardStyle, PriceShape, StickerShape } from '../../catalogTypes'

interface Props {
  style: CatalogCardStyle
  patch: (p: Partial<CatalogCardStyle>) => void
}

const PRICE_SHAPES: { value: PriceShape; label: string }[] = [
  { value: 'tag', label: 'Étiquette (coins soudés)' },
  { value: 'rounded', label: 'Coins arrondis' },
  { value: 'pill', label: 'Pastille (pilule)' },
  { value: 'square', label: 'Carré net' },
]

const STICKER_SHAPES: { value: StickerShape; label: string }[] = [
  { value: 'round', label: 'Rond' },
  { value: 'rounded', label: 'Carré arrondi' },
  { value: 'square', label: 'Carré net' },
]

export function CardStyleShapes({ style, patch }: Props) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <span className="text-xs text-white/40">Badge prix</span>
        <select value={style.priceShape} onChange={(e) => patch({ priceShape: e.target.value as PriceShape })} className={inputCls}>
          {PRICE_SHAPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <SliderField label="Inclinaison du prix" value={style.priceRotate} onChange={(v) => patch({ priceRotate: v })}
          min={-12} max={12} step={1} unit="°" />
      </div>
      <div className="space-y-1">
        <span className="text-xs text-white/40">Sticker remise</span>
        <select value={style.stickerShape} onChange={(e) => patch({ stickerShape: e.target.value as StickerShape })} className={inputCls}>
          {STICKER_SHAPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <SliderField label="Inclinaison du sticker" value={style.stickerRotate} onChange={(v) => patch({ stickerRotate: v })}
          min={-15} max={15} step={1} unit="°" />
      </div>
    </div>
  )
}
