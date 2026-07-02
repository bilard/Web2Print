// src/features/catalog/components/pages/ProductCell.tsx
// Fiche produit d'une cellule de grille. `featured` = pleine page (typo agrandie via .cat-featured).
import type { PromoFields } from '@/features/retail-promo/promoTypes'
import { formatPrice } from './catalogCss'
import { useResolvedImage } from '../../useResolvedImage'

interface Props {
  fields: PromoFields
  featured: boolean
  /** Sous-famille du produit — pastille kicker en haut de fiche (flux continu). */
  kicker?: string
}

export function ProductCell({ fields: f, featured, kicker }: Props) {
  // Résolution Drive/CORS → blob:/data: (voir useResolvedImage). `data-resolving` est
  // lu par useCatalogExport.waitAssets pour attendre la fin de la résolution async
  // avant capture html2canvas (l'<img> n'existe pas tant que src n'est pas prêt).
  const { src, resolving } = useResolvedImage(f.image)
  return (
    <div className={`cat-cell${featured ? ' cat-featured' : ''}`}>
      <div className="cat-cell-img" data-resolving={resolving ? 'true' : undefined}>
        {src ? <img src={src} alt="" /> : <span className="cat-cell-img-ph">Sans visuel</span>}
      </div>
      {kicker && <span className="cat-cell-kicker">{kicker}</span>}
      <div className="cat-cell-body">
        {f.brand && <span className="cat-cell-brand">{f.brand}</span>}
        <span className="cat-cell-name">{f.name || 'Produit'}</span>
        {f.description && <span className="cat-cell-desc">{f.description}</span>}
        <div className="cat-cell-row">
          <span className="cat-cell-ref">{f.ref}</span>
          <span className="cat-cell-pricebox">
            {f.oldPrice != null && f.newPrice != null && f.oldPrice > f.newPrice && <span className="cat-cell-was">{formatPrice(f.oldPrice)}</span>}
            <span className="cat-cell-price">{formatPrice(f.newPrice)}</span>
          </span>
        </div>
      </div>
    </div>
  )
}
