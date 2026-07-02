// src/features/catalog/components/pages/ProductCell.tsx
// Fiche produit d'une cellule de grille. `featured` = pleine page (typo agrandie via .cat-featured).
import type { PromoFields } from '@/features/retail-promo/promoTypes'
import { formatPrice } from './catalogCss'

interface Props { fields: PromoFields; featured: boolean }

export function ProductCell({ fields: f, featured }: Props) {
  return (
    <div className={`cat-cell${featured ? ' cat-featured' : ''}`}>
      <div className="cat-cell-img">
        {f.image ? <img src={f.image} alt="" crossOrigin="anonymous" /> : <span className="cat-cell-img-ph">Sans visuel</span>}
      </div>
      <div className="cat-cell-body">
        {f.brand && <span className="cat-cell-brand">{f.brand}</span>}
        <span className="cat-cell-name">{f.name || 'Produit'}</span>
        {f.description && <span className="cat-cell-desc">{f.description}</span>}
        <div className="cat-cell-row">
          <span className="cat-cell-ref">{f.ref}</span>
          <span>
            {f.oldPrice != null && f.newPrice != null && f.oldPrice > f.newPrice && <span className="cat-cell-was">{formatPrice(f.oldPrice)}</span>}
            <span className="cat-cell-price">{formatPrice(f.newPrice)}</span>
          </span>
        </div>
      </div>
    </div>
  )
}
