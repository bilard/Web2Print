// src/features/catalog/components/steps/CardObjectSettings.tsx
// Panneau « Bloc sélectionné » : TOUS les réglages de l'objet cliqué dans
// l'aperçu, regroupés en TÊTE de « Style des fiches » — taille, police,
// liaison, rotation (par variante), visibilité et cases couleur (fond + textes).
// Les listes complètes (typo, couleurs) restent disponibles en dessous.
import { FontSelectOptions } from '@/features/fonts/FontSelectOptions'
import { SliderField, inputCls } from '@/components/shared/panel'
import { CARD_OBJECT_IDS, type CardObjectId, type CatalogCardStyle, type CatalogTheme } from '../../catalogTypes'
import { freeLayoutBox } from '../pages/freeLayout'
import { ColorObjectField, OBJ_COLOR_KEYS, colorDefs } from './CardStyleColors'
import { CARD_TYPO_FIELDS, OBJ_LABEL, objectLinkPatch } from './CardStyleTypo'

interface Props {
  obj: CardObjectId
  style: CatalogCardStyle
  theme: CatalogTheme
  patch: (p: Partial<CatalogCardStyle>) => void
  /** Variante éditée dans l'aperçu — la rotation/liaison écrivent dans SON jeu de boîtes. */
  wide: boolean
}

/** Case à cocher de visibilité de l'objet. */
const OBJ_SHOW: Partial<Record<CardObjectId, keyof CatalogCardStyle>> = {
  promo: 'showPromo', sticker: 'showSticker', kicker: 'showKicker', description: 'showDesc',
  ref: 'showRef', unit: 'showUnit', vedette: 'showVedette', details: 'showDetails',
  image: 'showImage', brand: 'showBrand', name: 'showName', price: 'showPrice',
}

export function CardObjectSettings({ obj, style, theme, patch, wide }: Props) {
  const typo = CARD_TYPO_FIELDS.find((f) => f.obj === obj)
  const colors = colorDefs(theme).filter((d) => (OBJ_COLOR_KEYS[obj] ?? []).includes(d.key))
  const showKey = OBJ_SHOW[obj]
  const box = freeLayoutBox(obj, style, wide)
  const layoutKey = wide ? ('layoutWide' as const) : ('layout' as const)
  const setRotation = (r: number) =>
    patch({ [layoutKey]: { ...(style[layoutKey] ?? {}), [obj]: { ...box, r } } })

  return (
    <div className="space-y-2.5">
      {showKey && (
        <label className="flex items-center gap-1.5 text-xs text-white/60 cursor-pointer select-none">
          <input type="checkbox" checked={style[showKey] as boolean} onChange={(e) => patch({ [showKey]: e.target.checked } as Partial<CatalogCardStyle>)}
            className="accent-indigo-600" />
          Afficher ce bloc
        </label>
      )}
      {typo && (
        <>
          <SliderField label="Taille" value={style[typo.scale]} onChange={(v) => patch({ [typo.scale]: v } as Partial<CatalogCardStyle>)}
            min={0.7} max={10} step={0.05} unit="×" />
          <select value={style[typo.font]} onChange={(e) => patch({ [typo.font]: e.target.value } as Partial<CatalogCardStyle>)}
            className={inputCls}>
            <option value="">Police du thème</option>
            <FontSelectOptions />
          </select>
        </>
      )}
      <SliderField label={`Rotation (${wide ? 'pleine largeur' : 'verticale'})`} value={box.r ?? 0}
        onChange={setRotation} min={-45} max={45} step={1} unit="°" />
      {colors.length > 0 && (
        <div className="grid grid-cols-2 gap-x-2 gap-y-2">
          {colors.map((def) => <ColorObjectField key={def.key} def={def} style={style} patch={patch} />)}
        </div>
      )}
      {obj !== 'image' && (
        <label className="flex items-center gap-1.5 text-[10px] text-white/40"
          title="Liaison : ce bloc est soudé à DROITE du bloc choisi et le suit partout">
          🔗
          <select value={box.link ?? ''} onChange={(e) => patch(objectLinkPatch(style, wide, obj, e.target.value))}
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
}
