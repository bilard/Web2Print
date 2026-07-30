// Sous-panneau « couleurs » du style de fiches, COMPACT : grille 2 colonnes,
// un item = étiquette + pastille couleur ; dégradé = lien « ◐ » discret sur
// l'étiquette (fin de dégradé + ✕ = retour à l'uni). Angle commun, arrondi.
// Sélectionner un bloc dans l'aperçu SURLIGNE ses cases (fond + textes).
import { ColorPicker } from '@/components/shared/ColorPicker'
import { SliderField } from '@/components/shared/panel'
import type { CardObjectId, CatalogCardStyle, CatalogTheme } from '../../catalogTypes'
import { t, type TranslationKey } from '@/lib/i18n'

interface CardStyleColorsProps {
  style: CatalogCardStyle
  theme: CatalogTheme
  patch: (p: Partial<CatalogCardStyle>) => void
  /** Objet sélectionné dans l'aperçu (disposition libre) — surligne + scrolle ses cases. */
  selected?: CardObjectId | null
}

export type ColorKey = 'promoBg' | 'stickerBg' | 'priceBg' | 'wasBg' | 'kickerBg' | 'bandRuleColor' | 'nameColor' | 'vedetteBg' | 'vedettePriceBg' | 'priceInk' | 'vedettePriceInk'
  | 'promoInk' | 'stickerInk' | 'kickerInk' | 'wasInk' | 'vedetteTxtInk' | 'brandColor' | 'descColor' | 'refColor' | 'unitColor' | 'detailsColor' | 'detailsBg' | 'cardBg'
type GradKey = 'promoBg2' | 'stickerBg2' | 'priceBg2' | 'wasBg2' | 'kickerBg2' | 'vedetteBg2' | 'vedettePriceBg2'

export interface ColorDef { key: ColorKey; grad?: GradKey; labelKey: TranslationKey; fallback: string }

/** Cases couleur de chaque objet de la fiche (fond + texte) — pour le panneau « Bloc sélectionné ». */
export const OBJ_COLOR_KEYS: Partial<Record<CardObjectId, ColorKey[]>> = {
  promo: ['promoBg', 'promoInk'],
  sticker: ['stickerBg', 'stickerInk'],
  kicker: ['kickerBg', 'kickerInk', 'bandRuleColor'],
  price: ['priceBg', 'wasBg', 'priceInk', 'wasInk'],
  vedette: ['vedetteBg', 'vedettePriceBg', 'vedetteTxtInk', 'vedettePriceInk'],
  name: ['nameColor'], brand: ['brandColor'], description: ['descColor'],
  ref: ['refColor'], unit: ['unitColor'], details: ['detailsColor', 'detailsBg'],
}

/** Cellule compacte : étiquette (+ ◐ dégradé) puis pastille ; 2e pastille si dégradé actif. */
export function ColorObjectField({ def, style, patch, highlighted, innerRef }: {
  def: ColorDef; style: CatalogCardStyle; patch: CardStyleColorsProps['patch']
  highlighted?: boolean; innerRef?: (el: HTMLDivElement | null) => void
}) {
  const { key, grad, labelKey, fallback } = def
  const label = t(labelKey)
  const base = style[key]
  const gradValue = grad ? style[grad] : ''

  return (
    <div ref={innerRef} className={`min-w-0 space-y-0.5 ${highlighted ? 'ring-2 ring-indigo-500 rounded-md p-1 -m-1' : ''}`}>
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] text-white/30 uppercase tracking-wider truncate" title={label}>{label}</span>
        {grad && !gradValue && (
          <button type="button" onClick={() => patch({ [grad]: base || fallback } as Partial<CatalogCardStyle>)}
            className="text-[10px] text-white/25 hover:text-white leading-none shrink-0" title={t('cat.style.addGradient')}>◐+</button>
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

/** Définitions des cases couleur (repli = couleur héritée du thème) — source
 *  unique de la grille complète ET du panneau « Bloc sélectionné ». */
export function colorDefs(theme: CatalogTheme): ColorDef[] {
  return [
    { key: 'promoBg', grad: 'promoBg2', labelKey: 'cat.style.promoBg', fallback: theme.accent },
    { key: 'stickerBg', grad: 'stickerBg2', labelKey: 'cat.style.stickerBg', fallback: theme.accent },
    { key: 'priceBg', grad: 'priceBg2', labelKey: 'cat.style.priceBg', fallback: theme.accent },
    { key: 'wasBg', grad: 'wasBg2', labelKey: 'cat.style.wasBg', fallback: theme.headerBg },
    { key: 'cardBg', labelKey: 'cat.style.cardBg', fallback: '#ffffff' },
    { key: 'kickerBg', grad: 'kickerBg2', labelKey: 'cat.style.kickerBg', fallback: theme.headerBg },
    { key: 'bandRuleColor', labelKey: 'cat.style.bandRuleColor', fallback: theme.accent },
    { key: 'vedetteBg', grad: 'vedetteBg2', labelKey: 'cat.style.vedetteBg', fallback: theme.accent },
    { key: 'vedettePriceBg', grad: 'vedettePriceBg2', labelKey: 'cat.style.vedettePriceBg', fallback: theme.accent },
    { key: 'priceInk', labelKey: 'cat.style.priceInk', fallback: '#ffffff' },
    { key: 'vedettePriceInk', labelKey: 'cat.style.vedettePriceInk', fallback: '#ffffff' },
    // Textes des badges (fond ↑ · texte ↓).
    { key: 'promoInk', labelKey: 'cat.style.promoInk', fallback: '#ffffff' },
    { key: 'stickerInk', labelKey: 'cat.style.stickerInk', fallback: '#ffffff' },
    { key: 'kickerInk', labelKey: 'cat.style.kickerInk', fallback: theme.headerInk },
    { key: 'wasInk', labelKey: 'cat.style.wasInk', fallback: theme.headerInk },
    { key: 'vedetteTxtInk', labelKey: 'cat.style.vedetteTxtInk', fallback: '#ffffff' },
    // Textes de contenu.
    { key: 'nameColor', labelKey: 'cat.style.nameColor', fallback: theme.ink },
    { key: 'brandColor', labelKey: 'cat.style.brandColor', fallback: theme.accent },
    { key: 'descColor', labelKey: 'cat.style.descColor', fallback: theme.ink },
    { key: 'refColor', labelKey: 'cat.style.refColor', fallback: theme.ink },
    { key: 'unitColor', labelKey: 'cat.style.unitColor', fallback: theme.ink },
    { key: 'detailsColor', labelKey: 'cat.style.detailsColor', fallback: theme.ink },
    { key: 'detailsBg', labelKey: 'cat.style.detailsBg', fallback: '#efefef' },
  ]
}

export function CardStyleColors({ style, theme, patch, selected }: CardStyleColorsProps) {
  // Surlignage passif : les cases du bloc sélectionné (le scroll appartient au
  // panneau « Bloc sélectionné » en tête, qui regroupe déjà ces réglages).
  const active = new Set<ColorKey>(selected ? (OBJ_COLOR_KEYS[selected] ?? []) : [])
  const COLORS = colorDefs(theme)
  const hasGradient = COLORS.some(({ grad }) => grad && style[grad])

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-x-2 gap-y-2">
        {COLORS.map((def) => (
          <ColorObjectField key={def.key} def={def} style={style} patch={patch} highlighted={active.has(def.key)} />
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
