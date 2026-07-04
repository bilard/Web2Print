// src/features/catalog/components/steps/CardStylePreview.tsx
// Aperçu LIVE du template de fiche (variantes verticale + horizontale) avec le
// thème et le style cosmétique courants — même moteur de rendu que les pages.
import type { PromoFields } from '@/features/retail-promo/promoTypes'
import type { CatalogCardStyle, CatalogTheme } from '../../catalogTypes'
import { CATALOG_CSS, cardStyleVars, themeVars } from '../pages/catalogCss'
import { ProductCell } from '../pages/ProductCell'

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
}

export function CardStylePreview({ theme, cardStyle, fields }: Props) {
  const f = fields ?? SAMPLE_FIELDS
  return (
    <div className="cat-page rounded-md overflow-hidden shrink-0 border border-border"
      style={{ width: 330, ...themeVars(theme), ...cardStyleVars(cardStyle, theme) }}>
      <style>{CATALOG_CSS}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12, background: 'var(--cat-bg)' }}>
        {/* Variante VEDETTE : les réglages du ruban/cadre se voient en live. */}
        <div style={{ height: 360, display: 'grid' }}>
          <ProductCell fields={f} featured kicker="Sous-famille" size="md" cardStyle={cardStyle} />
        </div>
        {/* Variante horizontale (grilles denses) : assez haute pour ne pas couper prix/réf. */}
        <div style={{ height: 190, display: 'grid' }}>
          <ProductCell fields={f} featured={false} kicker="Sous-famille" size="md" horizontal cardStyle={cardStyle} />
        </div>
      </div>
    </div>
  )
}
