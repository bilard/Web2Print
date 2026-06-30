// Construit les données d'affichage d'une carte promo (RetailCardData) à partir
// des champs extraits. SOURCE UNIQUE partagée par l'aperçu (StepRender) ET le
// panneau Calques, pour que la valeur montrée par calque corresponde EXACTEMENT
// à ce qui est rendu sur la carte.
import { formatPrice } from './priceParse'
import { computeRemiseLabel } from './promoMapping'
import type { PromoFields } from './promoTypes'
import type { RetailCardData } from './RetailPromoCard'

/** Texte de validité affiché en pied de page. */
function validText(f: PromoFields): string {
  if (f.validFrom && f.validTo) return `Offre valable du ${f.validFrom} au ${f.validTo}`
  if (f.validTo) return `Offre valable jusqu'au ${f.validTo}`
  return 'Dans la limite des stocks disponibles'
}

export function toCardData(f: PromoFields, euroSep: { now?: boolean; was?: boolean } = {}): RetailCardData {
  return {
    name: f.name,
    brand: f.brand || undefined,
    ref: f.ref || undefined,
    category: f.category || undefined,
    description: f.description || undefined,
    priceNow: f.newPrice != null ? formatPrice(f.newPrice, f.currency, euroSep.now) : '—',
    priceWas: f.oldPrice != null ? formatPrice(f.oldPrice, f.currency, euroSep.was) : undefined,
    unitPrice: f.unitPrice || undefined,
    remiseLabel: computeRemiseLabel(f),
    validite: validText(f),
    imageUrl: f.image ?? undefined,
  }
}
