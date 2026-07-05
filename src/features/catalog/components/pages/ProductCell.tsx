// src/features/catalog/components/pages/ProductCell.tsx
// Fiche produit d'une cellule de grille (toutes identiques ; les grandes cartes
// sont la même fiche MAGNIFIÉE par scale dans ProductGridPage), rendue en
// DISPOSITION LIBRE (LE mode) :
// chaque objet est une boîte en % (layout du style, repli FREE_DEFAULT_LAYOUT)
// avec ancrage liquide, liaisons et flux vertical aimanté. Conventions retail :
// cartouche promo en bandeau au-dessus de l'image, réf. + unité soudées en bas,
// prix ancré bas-droite (cf. skill retail-card-conventions).
import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import type { PromoFields } from '@/features/retail-promo/promoTypes'
import { formatPromoLabel } from '@/features/retail-promo/promoMapping'
import { DEFAULT_CARD_STYLE, type CardObjectId, type CatalogCardStyle } from '../../catalogTypes'
import { formatPrice } from './catalogCss'
import { applyMagneticFlow, freeLayoutBox } from './freeLayout'
import { useResolvedImage } from '../../useResolvedImage'

interface Props {
  fields: PromoFields
  featured: boolean
  /** Sous-famille du produit — pastille kicker en haut de fiche. */
  kicker?: string
  /** Champs libres (valeurs seules, sans label) — zone « Détails » sous la description. */
  details?: string[]
  /** Style cosmétique (visibilité des éléments) — les couleurs/tailles passent par les variables CSS. */
  cardStyle?: CatalogCardStyle
  /** Placement CSS grid (gridColumn/gridRow) calculé par le moteur. */
  style?: CSSProperties
  /** Carte LARGE (pleine largeur, ratio ≥ 1,3) : repli 2 colonnes — image à
   *  gauche, textes en colonne droite (FREE_WIDE_LAYOUT). Calculé par le parent
   *  depuis la forme RÉELLE de la cellule (déterministe, fiable à l'export). */
  wide?: boolean
  /** Double-clic sur la fiche → édition de la data produit (Aperçu du catalogue). */
  onEdit?: () => void
}

export function ProductCell({ fields: f, featured, kicker, details, cardStyle, style, wide = false, onEdit }: Props) {
  // Résolution Drive/CORS → blob:/data: (voir useResolvedImage). `data-resolving` est
  // lu par useCatalogExport.waitAssets pour attendre la fin de la résolution async
  // avant capture html2canvas (l'<img> n'existe pas tant que src n'est pas prêt).
  const { src, resolving } = useResolvedImage(f.image)
  // Flux vertical AIMANTÉ après chaque rendu : les blocs texte se collent/poussent
  // selon la hauteur réelle de leur contenu — jamais de superposition (même calcul
  // aperçu / pages du catalogue / export).
  const cs = cardStyle ?? DEFAULT_CARD_STYLE
  const freeRef = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    // Aimantation PAR BLOC (box.m ?? défaut magnetFlow) — gérée dans le moteur ;
    // les blocs détachés y sont remis à leur position configurée (idempotent).
    const card = freeRef.current
    if (!card) return
    const run = () => applyMagneticFlow(card, cs, wide)
    run()
    // Les mesures bougent APRÈS ce rendu : polices chargées (métriques des
    // fallbacks ≠ police finale) et redimensionnements — re-dérouler le moteur,
    // sinon les positions restent calées sur des hauteurs périmées (superpositions).
    document.fonts?.ready.then(run).catch(() => undefined)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(run)
    ro.observe(card)
    return () => ro.disconnect()
  })
  const hasWas = f.oldPrice != null && f.newPrice != null && f.oldPrice > f.newPrice
  const show = (key: 'showDesc' | 'showRef' | 'showUnit' | 'showSticker' | 'showKicker' | 'showPromo' | 'showVedette' | 'showDetails') => cardStyle?.[key] ?? true
  // Sticker rond = écart entre les 2 prix (remise calculée), en haut à droite de l'image.
  const sticker = show('showSticker') && hasWas && f.remisePct != null && f.remisePct > 0 ? `-${f.remisePct}%` : null
  // Cartouche = TEXTE promo (« Top affaire », « Prix choc »…) uniquement — le
  // pourcentage vit dans le sticker ; on masque le cartouche s'il ferait doublon.
  const label = show('showPromo') ? formatPromoLabel(f.promoLabel) : undefined
  const promo = label && label !== sticker ? label : null
  const obj = (id: CardObjectId, node: ReactNode) => {
    const b = freeLayoutBox(id, cs, wide)
    const scaled = b.sc != null && b.sc !== 1
    // Hauteur figée UNIQUEMENT pour l'image (elle REMPLIT sa boîte). Tous les
    // autres blocs ont un contenu intrinsèque (textes, badges prix/sticker…) :
    // une hauteur figée en % ne s'adapte ni à la volumétrie ni à la taille des
    // cartes → contenu rogné (ex. bas du badge prix coupé).
    const fixedH = b.h != null && id === 'image'
    // ANCRAGE LIQUIDE (ax/ay) : collé au bord droit/bas ou centré — stable sur
    // toutes les tailles de carte (mise en page liquide façon InDesign).
    // Un bloc LIÉ (link) est positionné par sa cible (applyMagneticFlow) →
    // rendu de base gauche/haut, sans ancre ni centrage.
    const ax = b.link ? 'l' : (b.ax ?? 'l'), ay = b.link ? 't' : (b.ay ?? 't')
    const posH: CSSProperties = ax === 'r' ? { right: `${b.x}%` } : { left: ax === 'c' ? '50%' : `${b.x}%` }
    const posV: CSSProperties = ay === 'b' ? { bottom: `${b.y}%` } : { top: ay === 'c' ? '50%' : `${b.y}%` }
    const tf: string[] = []
    if (ax === 'c') tf.push('translateX(-50%)')
    if (ay === 'c') tf.push('translateY(-50%)')
    if (scaled) tf.push(`scale(${b.sc})`)
    // ROTATION du bloc (contenu compris) : autour du CENTRE (naturel à l'œil) —
    // sauf bloc mis à l'échelle, dont l'origine doit rester le coin (existant).
    if (b.r) tf.push(`rotate(${b.r}deg)`)
    return (
      <div className="cat-obj" data-object-id={id}
        style={{ ...posH, ...posV, ...(b.w != null ? { width: `${b.w}%` } : {}), ...(fixedH ? { height: `${b.h}%`, overflow: 'hidden' } : {}),
          // Contenu aligné sur le bord d'ancrage (le badge prix colle à droite, pas au bord gauche de sa boîte).
          ...(ax !== 'l' ? { display: 'flex', justifyContent: ax === 'r' ? 'flex-end' : 'center' } : {}),
          ...(tf.length ? { transform: tf.join(' '), transformOrigin: scaled ? 'top left' : b.r ? 'center' : 'top left' } : {}) }}>
        {node}
      </div>
    )
  }
  return (
    <div ref={freeRef} className={`cat-cell cat-free cat-md${featured ? ' cat-featured' : ''}`} style={style}
      onDoubleClick={onEdit ? (e) => { e.stopPropagation(); onEdit() } : undefined}
      title={onEdit ? 'Double-clic : modifier les données du produit' : undefined}>
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
