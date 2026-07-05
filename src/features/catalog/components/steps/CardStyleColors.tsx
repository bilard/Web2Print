// src/features/catalog/components/steps/CardStyleColors.tsx
// Sous-panneau « couleurs » du style de fiches, COMPACT : grille 2 colonnes,
// un item = étiquette + pastille couleur ; dégradé = lien « ◐ » discret sur
// l'étiquette (fin de dégradé + ✕ = retour à l'uni). Angle commun, arrondi.
// Sélectionner un bloc dans l'aperçu SURLIGNE ses cases (fond + textes) et
// scrolle dessus.
import { useEffect, useRef } from 'react'
import { ColorPicker } from '@/components/shared/ColorPicker'
import { SliderField } from '@/components/shared/panel'
import type { CardObjectId, CatalogCardStyle, CatalogTheme } from '../../catalogTypes'

interface CardStyleColorsProps {
  style: CatalogCardStyle
  theme: CatalogTheme
  patch: (p: Partial<CatalogCardStyle>) => void
  /** Objet sélectionné dans l'aperçu (disposition libre) — surligne + scrolle ses cases. */
  selected?: CardObjectId | null
}

type ColorKey = 'promoBg' | 'stickerBg' | 'priceBg' | 'wasBg' | 'kickerBg' | 'nameColor' | 'vedetteBg' | 'vedettePriceBg' | 'priceInk' | 'vedettePriceInk'
  | 'promoInk' | 'stickerInk' | 'kickerInk' | 'wasInk' | 'vedetteTxtInk' | 'brandColor' | 'descColor' | 'refColor' | 'unitColor' | 'detailsColor' | 'detailsBg'
type GradKey = 'promoBg2' | 'stickerBg2' | 'priceBg2' | 'wasBg2' | 'kickerBg2' | 'vedetteBg2' | 'vedettePriceBg2'

interface ColorDef { key: ColorKey; grad?: GradKey; label: string; fallback: string }

/** Cases couleur de chaque objet de la fiche (fond + texte) — pour le surlignage à la sélection. */
const OBJ_COLOR_KEYS: Partial<Record<CardObjectId, ColorKey[]>> = {
  promo: ['promoBg', 'promoInk'],
  sticker: ['stickerBg', 'stickerInk'],
  kicker: ['kickerBg', 'kickerInk'],
  price: ['priceBg', 'wasBg', 'priceInk', 'wasInk'],
  vedette: ['vedetteBg', 'vedettePriceBg', 'vedetteTxtInk', 'vedettePriceInk'],
  name: ['nameColor'], brand: ['brandColor'], description: ['descColor'],
  ref: ['refColor'], unit: ['unitColor'], details: ['detailsColor', 'detailsBg'],
}

/** Cellule compacte : étiquette (+ ◐ dégradé) puis pastille ; 2e pastille si dégradé actif. */
function ColorObjectField({ def, style, patch, highlighted, innerRef }: {
  def: ColorDef; style: CatalogCardStyle; patch: CardStyleColorsProps['patch']
  highlighted?: boolean; innerRef?: (el: HTMLDivElement | null) => void
}) {
  const { key, grad, label, fallback } = def
  const base = style[key]
  const gradValue = grad ? style[grad] : ''

  return (
    <div ref={innerRef} className={`min-w-0 space-y-0.5 ${highlighted ? 'ring-2 ring-indigo-500 rounded-md p-1 -m-1' : ''}`}>
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] text-white/30 uppercase tracking-wider truncate" title={label}>{label}</span>
        {grad && !gradValue && (
          <button type="button" onClick={() => patch({ [grad]: base || fallback } as Partial<CatalogCardStyle>)}
            className="text-[10px] text-white/25 hover:text-white leading-none shrink-0" title="Ajouter un dégradé">◐+</button>
        )}
      </div>
      <ColorPicker value={base || fallback} onChange={(v) => patch({ [key]: v } as Partial<CatalogCardStyle>)} />
      {grad && gradValue && (
        <div className="flex items-center gap-1">
          <div className="flex-1 min-w-0">
            <ColorPicker value={gradValue} onChange={(v) => patch({ [grad]: v } as Partial<CatalogCardStyle>)} />
          </div>
          <button type="button" onClick={() => patch({ [grad]: '' } as Partial<CatalogCardStyle>)}
            className="text-white/40 hover:text-white leading-none shrink-0" title="Couleur unie">✕</button>
        </div>
      )}
    </div>
  )
}

export function CardStyleColors({ style, theme, patch, selected }: CardStyleColorsProps) {
  const active = new Set<ColorKey>(selected ? (OBJ_COLOR_KEYS[selected] ?? []) : [])
  const fieldRefs = useRef<Partial<Record<ColorKey, HTMLDivElement | null>>>({})
  useEffect(() => {
    const first = selected ? OBJ_COLOR_KEYS[selected]?.[0] : undefined
    if (first) fieldRefs.current[first]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [selected])
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
    // Textes des badges (fond ↑ · texte ↓).
    { key: 'promoInk', label: 'Texte cartouche', fallback: '#ffffff' },
    { key: 'stickerInk', label: 'Texte sticker', fallback: '#ffffff' },
    { key: 'kickerInk', label: 'Txt sous-famille', fallback: theme.headerInk },
    { key: 'wasInk', label: 'Txt prix barré', fallback: theme.headerInk },
    { key: 'vedetteTxtInk', label: 'Texte ruban', fallback: '#ffffff' },
    // Textes de contenu.
    { key: 'nameColor', label: 'Nom', fallback: theme.ink },
    { key: 'brandColor', label: 'Marque', fallback: theme.accent },
    { key: 'descColor', label: 'Description', fallback: theme.ink },
    { key: 'refColor', label: 'Référence', fallback: theme.ink },
    { key: 'unitColor', label: 'Unité', fallback: theme.ink },
    { key: 'detailsColor', label: 'Détails (texte)', fallback: theme.ink },
    { key: 'detailsBg', label: 'Détails (fond)', fallback: '#efefef' },
  ]
  const hasGradient = COLORS.some(({ grad }) => grad && style[grad])

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-x-2 gap-y-2">
        {COLORS.map((def) => (
          <ColorObjectField key={def.key} def={def} style={style} patch={patch}
            highlighted={active.has(def.key)} innerRef={(el) => { fieldRefs.current[def.key] = el }} />
        ))}
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
