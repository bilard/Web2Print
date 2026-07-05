// src/features/catalog/components/pages/ProductCell.tsx
// Fiche produit d'une cellule de grille. `size` suit le span issu du packing
// (md 1×1, lg carte élargie, xl grande carte / pleine page) ; `featured` ajoute
// le design vedette (cadre accent + ruban) par-dessus la taille. Conventions
// retail : cartouche promo au-dessus de l'image, réf. sous la description,
// unité de vente sous le prix (cf. skill retail-card-conventions).
import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import type { PromoFields } from '@/features/retail-promo/promoTypes'
import { formatPromoLabel } from '@/features/retail-promo/promoMapping'
import type { CardObjectId, CatalogCardStyle } from '../../catalogTypes'
import { formatPrice } from './catalogCss'
import { applyMagneticFlow, freeLayoutBox, resetMagneticFlow } from './freeLayout'
import { useResolvedImage } from '../../useResolvedImage'

export type CellSize = 'md' | 'lg' | 'xl'

interface Props {
  fields: PromoFields
  featured: boolean
  /** Sous-famille du produit — pastille kicker en haut de fiche (flux continu). */
  kicker?: string
  size: CellSize
  /** Champs libres (valeurs seules, sans label) — zone « Détails » sous la description. */
  details?: string[]
  /** Layout horizontal (image gauche / contenu droite) : cartes larges et grilles denses. */
  horizontal?: boolean
  /** Style cosmétique (visibilité des éléments) — les couleurs/tailles passent par les variables CSS. */
  cardStyle?: CatalogCardStyle
  /** Placement CSS grid (gridColumn/gridRow) calculé par le moteur. */
  style?: CSSProperties
}

export function ProductCell({ fields: f, featured, kicker, size, details, horizontal, cardStyle, style }: Props) {
  // Résolution Drive/CORS → blob:/data: (voir useResolvedImage). `data-resolving` est
  // lu par useCatalogExport.waitAssets pour attendre la fin de la résolution async
  // avant capture html2canvas (l'<img> n'existe pas tant que src n'est pas prêt).
  const { src, resolving } = useResolvedImage(f.image)
  // Flux vertical AIMANTÉ (disposition libre) : après chaque rendu, les blocs texte
  // qui se chevauchent sont poussés vers le bas selon la hauteur réelle de leur
  // contenu — jamais de superposition (même calcul aperçu/catalogue/export).
  const freeRef = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    if (!cardStyle?.freeLayout || !freeRef.current) return
    // magnetFlow décoché = placement 100 % manuel (reset des top aimantés).
    if (cardStyle.magnetFlow ?? true) applyMagneticFlow(freeRef.current, cardStyle)
    else resetMagneticFlow(freeRef.current, cardStyle)
  })
  const hasWas = f.oldPrice != null && f.newPrice != null && f.oldPrice > f.newPrice
  const show = (key: 'showDesc' | 'showRef' | 'showUnit' | 'showSticker' | 'showKicker' | 'showPromo' | 'showVedette' | 'showDetails') => cardStyle?.[key] ?? true
  // Sticker rond = écart entre les 2 prix (remise calculée), en haut à droite de l'image.
  const sticker = show('showSticker') && hasWas && f.remisePct != null && f.remisePct > 0 ? `-${f.remisePct}%` : null
  // Cartouche = TEXTE promo (« Top affaire », « Prix choc »…) uniquement — le
  // pourcentage vit dans le sticker ; on masque le cartouche s'il ferait doublon.
  const label = show('showPromo') ? formatPromoLabel(f.promoLabel) : undefined
  const promo = label && label !== sticker ? label : null
  if (cardStyle?.freeLayout) {
    const obj = (id: CardObjectId, node: ReactNode) => {
      const b = freeLayoutBox(id, cardStyle)
      const scaled = b.sc != null && b.sc !== 1
      return (
        <div className="cat-obj" data-object-id={id}
          style={{ left: `${b.x}%`, top: `${b.y}%`, ...(b.w != null ? { width: `${b.w}%` } : {}), ...(b.h != null ? { height: `${b.h}%`, overflow: 'hidden' } : {}),
            ...(scaled ? { transform: `scale(${b.sc})`, transformOrigin: 'top left' } : {}) }}>
          {node}
        </div>
      )
    }
    return (
      <div ref={freeRef} className={`cat-cell cat-free cat-${size}${featured ? ' cat-featured' : ''}`} style={style}>
        {promo && obj('promo', <span className="cat-cell-promo">{promo}</span>)}
        {obj('image', <div className="cat-cell-img-in" data-resolving={resolving ? 'true' : undefined}>{src ? <img src={src} alt="" /> : <span className="cat-cell-img-ph">Sans visuel</span>}</div>)}
        {sticker && obj('sticker', <span className="cat-price-sticker">{sticker}</span>)}
        {kicker && show('showKicker') && obj('kicker', <span className="cat-cell-kicker">{kicker}</span>)}
        {featured && show('showVedette') && obj('vedette', <span className="cat-cell-vedette">★ {cardStyle?.vedetteLabel || 'Vedette'}</span>)}
        {f.brand && obj('brand', <span className="cat-cell-brand">{f.brand}</span>)}
        {obj('name', <span className="cat-cell-name">{f.name || 'Produit'}</span>)}
        {f.description && show('showDesc') && obj('description', <span className="cat-cell-desc">{f.description}</span>)}
        {f.ref && show('showRef') && obj('ref', <span className="cat-cell-refcode">Réf. {f.ref}</span>)}
        {f.unit && show('showUnit') && obj('unit', <span className="cat-cell-unit">Unité : {f.unit}</span>)}
        {obj('price', <span className="cat-cell-pricebox"><span className="cat-cell-tag">{hasWas && <span className="cat-cell-was">{formatPrice(f.oldPrice)}</span>}<span className="cat-cell-price">{formatPrice(f.newPrice)}</span></span></span>)}
        {details && details.length > 0 && show('showDetails') && obj('details', <div className="cat-cell-details">{details.map((d, i) => <span key={i}>{d}</span>)}</div>)}
      </div>
    )
  }
  return (
    <div className={`cat-cell cat-${size}${horizontal ? ' cat-hz' : ''}${featured ? ' cat-featured' : ''}${promo ? ' cat-has-promo' : ''}`} style={style}>
      {promo && <span className="cat-cell-promo">{promo}</span>}
      <div className="cat-cell-img" data-resolving={resolving ? 'true' : undefined}>
        {/* Cadre ABSOLU : donne une boîte définie à l'image (les % dans du flex
            imbriqué sont mal résolus par html2canvas à l'export PDF). */}
        {src ? <div className="cat-cell-img-in"><img src={src} alt="" /></div> : <span className="cat-cell-img-ph">Sans visuel</span>}
        {sticker && <span className="cat-price-sticker">{sticker}</span>}
      </div>
      {kicker && show('showKicker') && <span className="cat-cell-kicker">{kicker}</span>}
      {featured && show('showVedette') && <span className="cat-cell-vedette">★ {cardStyle?.vedetteLabel || 'Vedette'}</span>}
      <div className="cat-cell-body">
        {f.brand && <span className="cat-cell-brand">{f.brand}</span>}
        <span className="cat-cell-name">{f.name || 'Produit'}</span>
        {f.description && show('showDesc') && <span className="cat-cell-desc">{f.description}</span>}
        {details && details.length > 0 && show('showDetails') && (
          <div className="cat-cell-details">{details.map((d, i) => <span key={i}>{d}</span>)}</div>
        )}
        {/* Rangée du bas : réf/unité à GAUCHE du prix (comble l'espace vide). */}
        <div className="cat-cell-row">
          <span className="cat-cell-meta">
            {f.ref && show('showRef') && <span className="cat-cell-refcode">Réf. {f.ref}</span>}
            {f.unit && show('showUnit') && <span className="cat-cell-unit">Unité : {f.unit}</span>}
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
