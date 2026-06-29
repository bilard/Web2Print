export type PromoMechanism = 'simple' | 'remise' | 'lot' | 'pack'

export interface PromoFields {
  name: string
  image: string | null
  brand: string
  ref: string
  ean: string
  oldPrice: number | null
  newPrice: number | null
  currency: string            // ISO, défaut 'EUR'
  unit: string                // ex '/kg' ; '' si aucun
  description: string         // texte descriptif produit
  category: string            // univers / famille / sous-famille
  unitPrice: string           // prix unitaire affichable (ex '12,90 €/m²')
  promoLabel: string          // mécanique promo brute (colonne Promotion/Mechanic)
  mechanism: PromoMechanism
  remisePct: number | null    // calculé
  remiseMontant: number | null// calculé
  lotQty: number | null
  lotOffert: number | null
  lotPrice: number | null
  validFrom: string | null
  validTo: string | null
  mentions: string
  enseigne: string
  badges: string[]
}

export type PromoFieldKey = keyof PromoFields
