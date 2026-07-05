// src/features/catalog/components/steps/CardStyleShapes.tsx
// Presets de forme PAR OBJET : chaque bloc à badge (prix, sticker de remise) a
// sa rangée de formes cliquables (aperçu-mock de la forme réelle) + son
// inclinaison. Appliqué en variables CSS (--cat-price-radius/rot,
// --cat-sticker-radius/rot) par-dessus le template fluide, comme le reste.
// La rangée du bloc SÉLECTIONNÉ dans l'aperçu est surlignée (anneau indigo).
import { SliderField } from '@/components/shared/panel'
import type { CardObjectId, CatalogCardStyle, PriceShape, StickerShape } from '../../catalogTypes'

interface Props {
  style: CatalogCardStyle
  patch: (p: Partial<CatalogCardStyle>) => void
  /** Objet sélectionné dans l'aperçu — surligne sa rangée de formes. */
  selected?: CardObjectId | null
}

const PRICE_SHAPES: { value: PriceShape; label: string; radius: number }[] = [
  { value: 'tag', label: 'Étiquette (coins soudés)', radius: 3 },
  { value: 'rounded', label: 'Coins arrondis', radius: 6 },
  { value: 'pill', label: 'Pastille (pilule)', radius: 99 },
  { value: 'square', label: 'Carré net', radius: 0 },
]

const STICKER_SHAPES: { value: StickerShape; label: string; radius: number }[] = [
  { value: 'round', label: 'Rond', radius: 99 },
  { value: 'rounded', label: 'Carré arrondi', radius: 5 },
  { value: 'square', label: 'Carré net', radius: 2 },
]

function ShapeButton({ title, active, radius, size, onClick }: {
  title: string; active: boolean; radius: number; size: [number, number]; onClick: () => void
}) {
  return (
    <button type="button" title={title} onClick={onClick}
      className={`flex items-center justify-center p-1.5 rounded-md border ${
        active ? 'border-indigo-500 bg-indigo-500/15' : 'border-border bg-surface-2 hover:border-indigo-500/60'}`}>
      <span style={{ width: size[0], height: size[1], borderRadius: radius, display: 'inline-block' }}
        className={active ? 'bg-indigo-400' : 'bg-white/40'} />
    </button>
  )
}

export function CardStyleShapes({ style, patch, selected }: Props) {
  const row = (obj: CardObjectId) => `space-y-1.5 rounded-md ${selected === obj ? 'ring-2 ring-indigo-500 p-1.5 -m-1.5' : ''}`
  return (
    <div className="space-y-3">
      <div className={row('price')}>
        <span className="text-xs text-white/40">Badge prix</span>
        <div className="flex gap-1.5">
          {PRICE_SHAPES.map((s) => (
            <ShapeButton key={s.value} title={s.label} active={style.priceShape === s.value}
              radius={s.radius} size={[26, 13]} onClick={() => patch({ priceShape: s.value })} />
          ))}
        </div>
        <SliderField label="Inclinaison" value={style.priceRotate} onChange={(v) => patch({ priceRotate: v })}
          min={-12} max={12} step={1} unit="°" />
      </div>
      <div className={row('sticker')}>
        <span className="text-xs text-white/40">Sticker remise</span>
        <div className="flex gap-1.5">
          {STICKER_SHAPES.map((s) => (
            <ShapeButton key={s.value} title={s.label} active={style.stickerShape === s.value}
              radius={s.radius} size={[16, 16]} onClick={() => patch({ stickerShape: s.value })} />
          ))}
        </div>
        <SliderField label="Inclinaison" value={style.stickerRotate} onChange={(v) => patch({ stickerRotate: v })}
          min={-15} max={15} step={1} unit="°" />
      </div>
    </div>
  )
}
