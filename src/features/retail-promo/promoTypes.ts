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
