// src/features/catalog/components/steps/CardStyleColors.tsx
// Sous-panneau « couleurs » du style de fiches : couleur (et fin de DÉGRADÉ
// optionnelle, ✕ = retour à l'uni) par objet, angle commun, arrondi.
import type { CatalogCardStyle, CatalogTheme } from '../../catalogTypes'

interface CardStyleColorsProps {
  style: CatalogCardStyle
  theme: CatalogTheme
  patch: (p: Partial<CatalogCardStyle>) => void
}

type ColorKey = 'promoBg' | 'stickerBg' | 'priceBg' | 'wasBg' | 'kickerBg' | 'nameColor' | 'vedetteBg' | 'vedettePriceBg' | 'priceInk' | 'vedettePriceInk'
type GradKey = 'promoBg2' | 'stickerBg2' | 'priceBg2' | 'wasBg2' | 'kickerBg2' | 'vedetteBg2' | 'vedettePriceBg2'

export function CardStyleColors({ style, theme, patch }: CardStyleColorsProps) {
  const COLORS: { key: ColorKey; grad?: GradKey; label: string; fallback: string }[] = [
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
    <div className="flex flex-wrap gap-3 items-start">
      {COLORS.map(({ key, grad, label, fallback }) => (
        <div key={key} className="flex flex-col items-center gap-1 text-xs text-white/40">
          {label}
          <input type="color" value={style[key] || fallback}
            onChange={(e) => patch({ [key]: e.target.value } as Partial<CatalogCardStyle>)}
            className="w-10 h-8 rounded-md bg-well cursor-pointer" />
          {grad && (
            <span className="flex items-center gap-0.5">
              <input type="color" value={style[grad] || style[key] || fallback} title="Fin de dégradé"
                onChange={(e) => patch({ [grad]: e.target.value } as Partial<CatalogCardStyle>)}
                className={`w-7 h-5 rounded bg-well cursor-pointer ${style[grad] ? '' : 'opacity-40'}`} />
              {style[grad] && (
                <button type="button" onClick={() => patch({ [grad]: '' } as Partial<CatalogCardStyle>)}
                  className="text-white/40 hover:text-white leading-none" title="Couleur unie">✕</button>
              )}
            </span>
          )}
        </div>
      ))}
      {hasGradient && (
        <label className="flex flex-col items-center gap-1 text-xs text-white/40">
          Angle
          <span className="flex items-center gap-2">
            <input type="range" min={0} max={360} step={15} value={style.gradientAngle}
              onChange={(e) => patch({ gradientAngle: Number(e.target.value) })} className="w-20 accent-indigo-600" />
            <b className="text-white tabular-nums">{style.gradientAngle}°</b>
          </span>
        </label>
      )}
      <label className="flex flex-col items-center gap-1 text-xs text-white/40">
        Arrondi
        <span className="flex items-center gap-2">
          <input type="range" min={0} max={16} step={1} value={style.radius}
            onChange={(e) => patch({ radius: Number(e.target.value) })} className="w-20 accent-indigo-600" />
          <b className="text-white tabular-nums">{style.radius}px</b>
        </span>
      </label>
    </div>
  )
}
