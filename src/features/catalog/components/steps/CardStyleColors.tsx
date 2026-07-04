// src/features/catalog/components/steps/CardStyleColors.tsx
// Sous-panneau « couleurs & image » du style de fiches : couleur (et fin de
// DÉGRADÉ optionnelle, ✕ = retour à l'uni) par objet, angle commun, arrondi,
// et taille de l'image (largeur de colonne + marge interne du visuel).
import type { CatalogCardStyle, CatalogTheme } from '../../catalogTypes'

interface CardStyleColorsProps {
  style: CatalogCardStyle
  theme: CatalogTheme
  patch: (p: Partial<CatalogCardStyle>) => void
}

type ColorKey = 'promoBg' | 'stickerBg' | 'priceBg' | 'wasBg' | 'kickerBg' | 'nameColor' | 'vedetteBg' | 'vedettePriceBg'
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
    { key: 'nameColor', label: 'Nom', fallback: theme.ink },
  ]
  const hasGradient = COLORS.some(({ grad }) => grad && style[grad])

  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Couleurs des objets <span className="normal-case font-normal">— 2e case = dégradé (✕ pour revenir à l'uni)</span>
        </div>
        <div className="flex flex-wrap gap-3 items-start">
          {COLORS.map(({ key, grad, label, fallback }) => (
            <div key={key} className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
              {label}
              <input type="color" value={style[key] || fallback}
                onChange={(e) => patch({ [key]: e.target.value } as Partial<CatalogCardStyle>)}
                className="w-10 h-8 rounded-md bg-surface-2 cursor-pointer" />
              {grad && (
                <span className="flex items-center gap-0.5">
                  <input type="color" value={style[grad] || style[key] || fallback} title="Fin de dégradé"
                    onChange={(e) => patch({ [grad]: e.target.value } as Partial<CatalogCardStyle>)}
                    className={`w-7 h-5 rounded bg-surface-2 cursor-pointer ${style[grad] ? '' : 'opacity-40'}`} />
                  {style[grad] && (
                    <button type="button" onClick={() => patch({ [grad]: '' } as Partial<CatalogCardStyle>)}
                      className="text-muted-foreground hover:text-white leading-none" title="Couleur unie">✕</button>
                  )}
                </span>
              )}
            </div>
          ))}
          {hasGradient && (
            <label className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
              Angle
              <span className="flex items-center gap-2">
                <input type="range" min={0} max={360} step={15} value={style.gradientAngle}
                  onChange={(e) => patch({ gradientAngle: Number(e.target.value) })} className="w-20 accent-indigo-600" />
                <b className="text-white tabular-nums">{style.gradientAngle}°</b>
              </span>
            </label>
          )}
          <label className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
            Arrondi
            <span className="flex items-center gap-2">
              <input type="range" min={0} max={16} step={1} value={style.radius}
                onChange={(e) => patch({ radius: Number(e.target.value) })} className="w-20 accent-indigo-600" />
              <b className="text-white tabular-nums">{style.radius}px</b>
            </span>
          </label>
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Image</div>
        <div className="grid grid-cols-2 gap-4">
          <label className="text-xs text-muted-foreground space-y-1">
            <span className="flex justify-between">Largeur (cartes horizontales)<b className="text-white tabular-nums">{style.imageShare}%</b></span>
            <input type="range" min={25} max={55} step={1} value={style.imageShare}
              onChange={(e) => patch({ imageShare: Number(e.target.value) })} className="w-full accent-indigo-600" />
          </label>
          <label className="text-xs text-muted-foreground space-y-1">
            <span className="flex justify-between">Marge du visuel<b className="text-white tabular-nums">{style.imagePad}px</b></span>
            <input type="range" min={0} max={30} step={1} value={style.imagePad}
              onChange={(e) => patch({ imagePad: Number(e.target.value) })} className="w-full accent-indigo-600" />
          </label>
        </div>
      </div>
    </div>
  )
}
