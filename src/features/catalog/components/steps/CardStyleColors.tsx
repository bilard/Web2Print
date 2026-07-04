// src/features/catalog/components/steps/CardStyleColors.tsx
// Sous-panneau « couleurs » du style de fiches : couleur (et fin de DÉGRADÉ
// optionnelle, ✕ = retour à l'uni) par objet, angle commun, arrondi.
// Widgets du kit : ColorField (base) + ColorPicker (fin de dégradé) + SliderField.
import { ColorPicker } from '@/components/shared/ColorPicker'
import { ColorField, SliderField } from '@/components/shared/panel'
import type { CatalogCardStyle, CatalogTheme } from '../../catalogTypes'

interface CardStyleColorsProps {
  style: CatalogCardStyle
  theme: CatalogTheme
  patch: (p: Partial<CatalogCardStyle>) => void
}

type ColorKey = 'promoBg' | 'stickerBg' | 'priceBg' | 'wasBg' | 'kickerBg' | 'nameColor' | 'vedetteBg' | 'vedettePriceBg' | 'priceInk' | 'vedettePriceInk'
type GradKey = 'promoBg2' | 'stickerBg2' | 'priceBg2' | 'wasBg2' | 'kickerBg2' | 'vedetteBg2' | 'vedettePriceBg2'

interface ColorDef { key: ColorKey; grad?: GradKey; label: string; fallback: string }

/** Une ligne : couleur de base (ColorField) + éventuel contrôle de dégradé (fin + ✕ / bouton d'ajout). */
function ColorObjectField({ def, style, patch }: { def: ColorDef; style: CatalogCardStyle; patch: CardStyleColorsProps['patch'] }) {
  const { key, grad, label, fallback } = def
  const base = style[key]
  const gradValue = grad ? style[grad] : ''

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border border-white/5 p-2">
      <ColorField label={label} value={base} inherit={fallback} onChange={(v) => patch({ [key]: v } as Partial<CatalogCardStyle>)} />
      {grad && (
        gradValue ? (
          <div className="flex items-end gap-1">
            <ColorPicker label="Fin de dégradé" value={gradValue} onChange={(v) => patch({ [grad]: v } as Partial<CatalogCardStyle>)} />
            <button type="button" onClick={() => patch({ [grad]: '' } as Partial<CatalogCardStyle>)}
              className="text-white/40 hover:text-white leading-none pb-1.5" title="Couleur unie">✕</button>
          </div>
        ) : (
          <button type="button" onClick={() => patch({ [grad]: base || fallback } as Partial<CatalogCardStyle>)}
            className="px-2 py-1.5 rounded-md text-xs text-white/40 hover:text-white border border-dashed border-white/10 hover:border-white/20"
            title="Ajouter un dégradé">+ dégradé</button>
        )
      )}
    </div>
  )
}

export function CardStyleColors({ style, theme, patch }: CardStyleColorsProps) {
  const COLORS: ColorDef[] = [
    { key: 'promoBg', grad: 'promoBg2', label: 'Cartouche', fallback: theme.accent },
    { key: 'stickerBg', grad: 'stickerBg2', label: 'Sticker', fallback: theme.accent },
    { key: 'priceBg', grad: 'priceBg2', label: 'Prix', fallback: theme.accent },
    { key: 'wasBg', grad: 'wasBg2', label: 'Prix barré', fallback: theme.headerBg },
    { key: 'kickerBg', grad: 'kickerBg2', label: 'Sous-famille', fallback: theme.headerBg },
    { key: 'vedetteBg', grad: 'vedetteBg2', label: 'Vedette', fallback: theme.accent },
    { key: 'vedettePriceBg', grad: 'vedettePriceBg2', label: 'Prix vedette', fallback: theme.accent },
    { key: 'priceInk', label: 'Texte prix', fallback: '#ffffff' },
    { key: 'vedettePriceInk', label: 'Txt prix vedette', fallback: '#ffffff' },
    { key: 'nameColor', label: 'Nom', fallback: theme.ink },
  ]
  const hasGradient = COLORS.some(({ grad }) => grad && style[grad])

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-2">
        {COLORS.map((def) => <ColorObjectField key={def.key} def={def} style={style} patch={patch} />)}
      </div>
      <div className="grid grid-cols-1 gap-3">
        {hasGradient && (
          <SliderField label="Angle du dégradé" value={style.gradientAngle} onChange={(v) => patch({ gradientAngle: v })}
            min={0} max={360} step={15} unit="°" />
        )}
        <SliderField label="Arrondi" value={style.radius} onChange={(v) => patch({ radius: v })}
          min={0} max={16} step={1} unit="px" />
      </div>
    </div>
  )
}
