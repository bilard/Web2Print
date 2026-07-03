// src/features/catalog/components/pages/ProductCell.tsx
// Fiche produit d'une cellule de grille. `size` suit le span issu du packing
// (md 1×1, lg carte élargie, xl grande carte / pleine page) ; `featured` ajoute
// le design vedette (cadre accent + ruban) par-dessus la taille. Conventions
// retail : cartouche promo au-dessus de l'image, réf. sous la description,
// unité de vente sous le prix (cf. skill retail-card-conventions).
import type React from 'react'
import type { PromoFields } from '@/features/retail-promo/promoTypes'
import { formatPromoLabel } from '@/features/retail-promo/promoMapping'
import { formatPrice } from './catalogCss'
import { useResolvedImage } from '../../useResolvedImage'

export type CellSize = 'md' | 'lg' | 'xl'

interface Props {
  fields: PromoFields
  featured: boolean
  /** Sous-famille du produit — pastille kicker en haut de fiche (flux continu). */
  kicker?: string
  size: CellSize
  /** Layout horizontal (image gauche / contenu droite) : cartes larges et grilles denses. */
  horizontal?: boolean
  /** Placement CSS grid (gridColumn/gridRow) calculé par le moteur. */
  style?: React.CSSProperties
}

export function ProductCell({ fields: f, featured, kicker, size, horizontal, style }: Props) {
  // Résolution Drive/CORS → blob:/data: (voir useResolvedImage). `data-resolving` est
  // lu par useCatalogExport.waitAssets pour attendre la fin de la résolution async
  // avant capture html2canvas (l'<img> n'existe pas tant que src n'est pas prêt).
  const { src, resolving } = useResolvedImage(f.image)
  const hasWas = f.oldPrice != null && f.newPrice != null && f.oldPrice > f.newPrice
  // Sticker rond = écart entre les 2 prix (remise calculée), en haut à droite de l'image.
  const sticker = hasWas && f.remisePct != null && f.remisePct > 0 ? `-${f.remisePct}%` : null
  // Cartouche = TEXTE promo (« Top affaire », « Prix choc »…) uniquement — le
  // pourcentage vit dans le sticker ; on masque le cartouche s'il ferait doublon.
  const label = formatPromoLabel(f.promoLabel)
  const promo = label && label !== sticker ? label : null
  return (
    <div className={`cat-cell cat-${size}${horizontal ? ' cat-hz' : ''}${featured ? ' cat-featured' : ''}${promo ? ' cat-has-promo' : ''}`} style={style}>
      {promo && <span className="cat-cell-promo">{promo}</span>}
      <div className="cat-cell-img" data-resolving={resolving ? 'true' : undefined}>
        {/* Cadre ABSOLU : donne une boîte définie à l'image (les % dans du flex
            imbriqué sont mal résolus par html2canvas à l'export PDF). */}
        {src ? <div className="cat-cell-img-in"><img src={src} alt="" /></div> : <span className="cat-cell-img-ph">Sans visuel</span>}
        {sticker && <span className="cat-price-sticker">{sticker}</span>}
      </div>
      {kicker && <span className="cat-cell-kicker">{kicker}</span>}
      {featured && <span className="cat-cell-vedette">★ Vedette</span>}
      <div className="cat-cell-body">
        {f.brand && <span className="cat-cell-brand">{f.brand}</span>}
        <span className="cat-cell-name">{f.name || 'Produit'}</span>
        {f.description && <span className="cat-cell-desc">{f.description}</span>}
        {/* Rangée du bas : réf/unité à GAUCHE du prix (comble l'espace vide). */}
        <div className="cat-cell-row">
          <span className="cat-cell-meta">
            {f.ref && <span className="cat-cell-refcode">Réf. {f.ref}</span>}
            {f.unit && <span className="cat-cell-unit">Unité : {f.unit}</span>}
          </span>
          <span className="cat-cell-pricebox">
            <span className="cat-cell-tag">
              {hasWas && <span className="cat-cell-was">{formatPrice(f.oldPrice)}</span>}
              <span className="cat-cell-price">{formatPrice(f.newPrice)}</span>
            </span>
          </span>
        </div>
      </div>
    </div>
  )
}
