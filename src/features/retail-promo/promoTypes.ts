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

export type PromoBlockId =
  | 'prix-barre' | 'badge-remise' | 'bandeau-lot' | 'bandeau-validite'
  | 'mentions' | 'badge-statut' | 'cadre-photo' | 'accroche'

export interface PlacedBlock {
  blockId: PromoBlockId
  xPct: number; yPct: number; wPct: number; hPct: number   // [0..1] de la page
  palette?: { primary?: string; accent?: string; text?: string }
  fontFamily?: string
}

export interface PromoLayout {
  id: string
  label: string
  width: number; height: number   // px (1px = 1/72 in)
  background: string               // hex
  blocks: PlacedBlock[]
}
