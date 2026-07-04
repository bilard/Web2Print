// src/features/catalog/components/steps/CardStylePreview.tsx
// Aperçu LIVE du template de fiche (variantes verticale + horizontale) avec le
// thème et le style cosmétique courants — même moteur de rendu que les pages.
import { useRef } from 'react'
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

interface Props {
  theme: CatalogTheme
  cardStyle: CatalogCardStyle
  /** Fiche exemple (1er produit sélectionné) — repli sur une fiche factice. */
  fields?: PromoFields | null
  /** Monte l'overlay de drag/resize (disposition libre) quand vrai. */
  editable?: boolean
  onLayoutChange?: (id: CardObjectId, box: CardBox) => void
  /** Objet sélectionné dans l'overlay (disposition libre) — remonté au parent pour le panneau de style. */
  onSelect?: (id: CardObjectId | null) => void
}

export function CardStylePreview({ theme, cardStyle, fields, editable, onLayoutChange, onSelect }: Props) {
  const f = fields ?? SAMPLE_FIELDS
  const cardRef = useRef<HTMLDivElement | null>(null)
  return (
    <div className="cat-page rounded-lg overflow-hidden shrink-0 border border-border relative shadow-2xl w-full max-w-[560px]"
      style={{ ...themeVars(theme), ...cardStyleVars(cardStyle, theme) }}>
      <style>{CATALOG_CSS}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16, background: 'var(--cat-bg)' }}>
        {/* Variante VEDETTE : les réglages du ruban/cadre se voient en live ; support de l'overlay de disposition libre. */}
        <div ref={cardRef} style={{ height: 560, display: 'grid', position: 'relative' }}>
          <ProductCell fields={f} featured kicker="Sous-famille" size="md" cardStyle={cardStyle} />
          {editable && cardStyle.freeLayout && onLayoutChange && (
            <CardLayoutOverlay cardRef={cardRef} style={cardStyle} onChange={onLayoutChange} onSelect={onSelect} />
          )}
        </div>
        {/* Variante horizontale (grilles denses) : assez haute pour ne pas couper prix/réf. */}
        <div style={{ height: 300, display: 'grid' }}>
          <ProductCell fields={f} featured={false} kicker="Sous-famille" size="md" horizontal cardStyle={cardStyle} />
        </div>
      </div>
    </div>
  )
}
