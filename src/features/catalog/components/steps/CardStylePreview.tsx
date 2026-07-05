// src/features/catalog/components/steps/CardStylePreview.tsx
// Aperçu LIVE du template de fiche avec le thème et le style cosmétique courants
// — même moteur de rendu que les pages. En DISPOSITION LIBRE, la carte est rendue
// à la taille EXACTE de la cellule imprimée (mêmes px + même --cat-fit) puis zoomée
// visuellement → ce qu'on place = ce qui s'imprime.
import { useRef, type CSSProperties } from 'react'
import type { PromoFields } from '@/features/retail-promo/promoTypes'
import type { CardBox, CardObjectId, CatalogCardStyle, CatalogTheme } from '../../catalogTypes'
import { CATALOG_CSS, cardStyleVars, themeVars } from '../pages/catalogCss'
import { ProductCell } from '../pages/ProductCell'
import { CardLayoutOverlay } from './CardLayoutOverlay'

const SAMPLE_FIELDS: PromoFields = {
  name: 'Table de jardin ALTO 792', image: null, brand: 'Jardipro', ref: '246674928', ean: '',
  oldPrice: 327.78, newPrice: 236, currency: 'EUR', unit: 'La pièce',
  description: 'Aluminium - 4 personnes - Noir mat - Garantie 2 ans', category: '', unitPrice: '',
  promoLabel: 'Prix choc', mechanism: 'remise', remisePct: 28, remiseMontant: null,
  lotQty: null, lotOffert: null, lotPrice: null, validFrom: null, validTo: null, mentions: '', enseigne: '', badges: [],
}

// Détails d'exemple : l'aperçu montre TOUJOURS la zone « Détails » (repli si aucun
// champ libre défini), pour qu'on puisse la voir/la positionner en disposition libre.
const SAMPLE_DETAILS = ['Avantages : Léger · Pliable · Résistant UV', 'Garantie : 2 ans', 'Matière : Aluminium']

interface Props {
  theme: CatalogTheme
  cardStyle: CatalogCardStyle
  /** Fiche exemple (1er produit sélectionné) — repli sur une fiche factice. */
  fields?: PromoFields | null
  /** Lignes du bloc « Détails » (champs libres) — pour que l'aperçu montre la même zone que le catalogue. */
  details?: string[]
  /** Cellule imprimée (px + facteur --cat-fit) — la carte éditée l'adopte À L'IDENTIQUE (disposition libre). */
  cell?: { w: number; h: number; fit: number }
  /** Monte l'overlay de drag/resize (disposition libre) quand vrai. */
  editable?: boolean
  onLayoutChange?: (id: CardObjectId, box: CardBox) => void
  /** Objet sélectionné dans l'overlay (disposition libre) — remonté au parent pour le panneau de style. */
  onSelect?: (id: CardObjectId | null) => void
}

export function CardStylePreview({ theme, cardStyle, fields, details, cell, editable, onLayoutChange, onSelect }: Props) {
  const f = fields ?? SAMPLE_FIELDS
  const d = details && details.length ? details : SAMPLE_DETAILS
  const cardRef = useRef<HTMLDivElement | null>(null)
  const overlay = editable && cardStyle.freeLayout && onLayoutChange
    ? <CardLayoutOverlay cardRef={cardRef} style={cardStyle} onChange={onLayoutChange} onSelect={onSelect} />
    : null

  // ── Disposition libre : réplique EXACTE de la cellule imprimée (mêmes px, même
  // --cat-fit → badges/texte au même ratio, zéro débordement), zoomée pour l'édition.
  if (cell) {
    const K = Math.max(1, Math.round((480 / cell.w) * 100) / 100)
    const pageStyle = { ...themeVars(theme), ...cardStyleVars(cardStyle, theme), ['--cat-fit']: String(Math.round(cell.fit * 100) / 100), width: cell.w * K + 32, background: 'var(--cat-bg)' } as CSSProperties
    return (
      <div className="cat-page rounded-lg overflow-hidden shrink-0 border border-border relative shadow-2xl" style={pageStyle}>
        <style>{CATALOG_CSS}</style>
        <div style={{ padding: 16 }}>
          {/* Conteneur qui réserve la place ZOOMÉE ; la carte interne est à la taille cellule exacte puis scale(K). */}
          <div style={{ width: cell.w * K, height: cell.h * K, position: 'relative' }}>
            <div ref={cardRef} className="cat-style-card-host" style={{ width: cell.w, height: cell.h, transform: `scale(${K})`, transformOrigin: 'top left', display: 'grid', position: 'relative' }}>
              <ProductCell fields={f} featured kicker="Sous-famille" size="md" details={d} cardStyle={cardStyle} />
              {overlay}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Mode cosmétique (auto) : deux variantes illustratives, hauteur fixe.
  return (
    <div className="cat-page rounded-lg overflow-hidden shrink-0 border border-border relative shadow-2xl w-full max-w-[560px]"
      style={{ ...themeVars(theme), ...cardStyleVars(cardStyle, theme) }}>
      <style>{CATALOG_CSS}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16, background: 'var(--cat-bg)' }}>
        <div ref={cardRef} className="cat-style-card-host" style={{ height: 560, display: 'grid', position: 'relative' }}>
          <ProductCell fields={f} featured kicker="Sous-famille" size="md" details={d} cardStyle={cardStyle} />
          {overlay}
        </div>
        <div style={{ height: 300, display: 'grid' }}>
          <ProductCell fields={f} featured={false} kicker="Sous-famille" size="md" horizontal details={d} cardStyle={cardStyle} />
        </div>
      </div>
    </div>
  )
}
