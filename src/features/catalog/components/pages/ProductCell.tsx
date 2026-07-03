// src/features/catalog/components/pages/ProductCell.tsx
// Fiche produit d'une cellule de grille. `size` suit le span issu du packing
// (md 1×1, lg carte élargie, xl grande carte / pleine page) ; `featured` ajoute
// le design vedette (cadre accent + ruban) par-dessus la taille. Conventions
// retail : cartouche promo au-dessus de l'image, réf. sous la description,
// unité de vente sous le prix (cf. skill retail-card-conventions).
import type React from 'react'
import type { PromoFields } from '@/features/retail-promo/promoTypes'
import { computeRemiseLabel } from '@/features/retail-promo/promoMapping'
import { formatPrice } from './catalogCss'
import { useResolvedImage } from '../../useResolvedImage'

export type CellSize = 'md' | 'lg' | 'xl'

interface Props {
  fields: PromoFields
  featured: boolean
  /** Sous-famille du produit — pastille kicker en haut de fiche (flux continu). */
  kicker?: string
  size: CellSize
  /** Placement CSS grid (gridColumn/gridRow) calculé par le moteur. */
  style?: React.CSSProperties
}

export function ProductCell({ fields: f, featured, kicker, size, style }: Props) {
  // Résolution Drive/CORS → blob:/data: (voir useResolvedImage). `data-resolving` est
  // lu par useCatalogExport.waitAssets pour attendre la fin de la résolution async
  // avant capture html2canvas (l'<img> n'existe pas tant que src n'est pas prêt).
  const { src, resolving } = useResolvedImage(f.image)
  // Cartouche promo : texte de la colonne Promotion (« Top affaire », « Prix
  // choc »…) prioritaire, sinon remise calculée — source unique computeRemiseLabel.
  const promo = computeRemiseLabel(f)
  return (
    <div className={`cat-cell cat-${size}${featured ? ' cat-featured' : ''}${promo ? ' cat-has-promo' : ''}`} style={style}>
      {promo && <span className="cat-cell-promo">{promo}</span>}
      <div className="cat-cell-img" data-resolving={resolving ? 'true' : undefined}>
        {src ? <img src={src} alt="" /> : <span className="cat-cell-img-ph">Sans visuel</span>}
      </div>
      {kicker && <span className="cat-cell-kicker">{kicker}</span>}
      {featured && <span className="cat-cell-vedette">★ Vedette</span>}
      <div className="cat-cell-body">
        {f.brand && <span className="cat-cell-brand">{f.brand}</span>}
        <span className="cat-cell-name">{f.name || 'Produit'}</span>
        {f.description && <span className="cat-cell-desc">{f.description}</span>}
        {f.ref && <span className="cat-cell-refcode">Réf. {f.ref}</span>}
        <div className="cat-cell-row">
          <span className="cat-cell-pricebox">
            {f.oldPrice != null && f.newPrice != null && f.oldPrice > f.newPrice && <span className="cat-cell-was">{formatPrice(f.oldPrice)}</span>}
            <span className="cat-cell-price">{formatPrice(f.newPrice)}</span>
            {f.unit && <span className="cat-cell-unit">Unité : {f.unit}</span>}
          </span>
        </div>
      </div>
    </div>
  )
}
