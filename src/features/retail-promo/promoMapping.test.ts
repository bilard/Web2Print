import { describe, it, expect } from 'vitest'
import { defaultPromoFieldMap, extractPromoFields, computeRemiseLabel, displayedRemisePct } from './promoMapping'
import type { MergeColumn, MergeRow } from '@/stores/merge.store'
import type { PromoFields } from './promoTypes'

/** PromoFields neutre + surcharges, pour tester l'affichage de la remise. */
const F = (over: Partial<PromoFields>): PromoFields => ({
  name: '', image: null, brand: '', ref: '', ean: '', oldPrice: null, newPrice: null,
  currency: 'EUR', unit: '', description: '', category: '', unitPrice: '', promoLabel: '',
  mechanism: 'simple', remisePct: null, remiseMontant: null, lotQty: null, lotOffert: null,
  lotPrice: null, validFrom: null, validTo: null, mentions: '', enseigne: '', badges: [], ...over,
})

const cols: MergeColumn[] = [
  { key: 'ai_name', label: 'Nom', fieldType: 'text' },
  { key: 'ai_images', label: 'Images', fieldType: 'image', aliases: ['Image', 'Photo'] },
  { key: 'prix_barre', label: 'Prix barré', fieldType: 'currency' },
  { key: 'prix', label: 'Prix', fieldType: 'currency' },
  { key: 'ean', label: 'EAN', fieldType: 'barcode' },
]

describe('defaultPromoFieldMap', () => {
  it('devine name/image/oldPrice/newPrice/ean depuis labels & aliases', () => {
    const m = defaultPromoFieldMap(cols)
    expect(m.name).toBe('ai_name')
    expect(m.image).toBe('ai_images')
    expect(m.oldPrice).toBe('prix_barre')
    expect(m.newPrice).toBe('prix')
    expect(m.ean).toBe('ean')
  })

  it('paire retail « Prix_barré » + « Prix_normal » : normal = prix de VENTE, barré = prix barré', () => {
    const m = defaultPromoFieldMap([
      { key: 'pb', label: 'Prix_barré', fieldType: 'currency' },
      { key: 'pn', label: 'Prix_normal', fieldType: 'currency' },
    ])
    expect(m.oldPrice).toBe('pb')
    expect(m.newPrice).toBe('pn')
  })

  it('garde anti-collision : une seule colonne prix → newPrice mappé, oldPrice abandonné', () => {
    const m = defaultPromoFieldMap([{ key: 'pb', label: 'Prix barré', fieldType: 'currency' }])
    expect(m.newPrice).toBe('pb') // repli partiel « prix »
    expect(m.oldPrice).toBeUndefined() // jamais la même colonne que newPrice
  })

  it('cartouche promo : la colonne TEXTE (Mechanic) prime sur la colonne ratio (Promotion)', () => {
    const m = defaultPromoFieldMap([
      { key: 'promo', label: 'Promotion', fieldType: 'number' },
      { key: 'mech', label: 'Mechanic', fieldType: 'text' },
    ])
    expect(m.promoLabel).toBe('mech')
  })
})

describe('extractPromoFields', () => {
  it('extrait + calcule la remise, conserve la CHAÎNE d’images (repli à la résolution)', () => {
    const row: MergeRow = { _id: '1', ai_name: 'Perceuse', ai_images: 'http://a/1.jpg | http://a/2.jpg', prix_barre: '100 €', prix: '75 €', ean: '123' }
    const f = extractPromoFields(row, cols, defaultPromoFieldMap(cols))
    expect(f.name).toBe('Perceuse')
    expect(f.image).toBe('http://a/1.jpg | http://a/2.jpg')
    expect(f.oldPrice).toBe(100)
    expect(f.newPrice).toBe(75)
    expect(f.remisePct).toBe(25)
    expect(f.mechanism).toBe('remise')
  })
  it('champs absents → valeurs neutres, mechanism simple', () => {
    const f = extractPromoFields({ _id: '2', ai_name: 'X', prix: '5 €' }, cols, defaultPromoFieldMap(cols))
    expect(f.oldPrice).toBeNull()
    expect(f.image).toBeNull()
    expect(f.mechanism).toBe('simple')
    expect(f.currency).toBe('EUR')
  })
})

describe('computeRemiseLabel', () => {
  it('colonne « Promotion » prioritaire (entier, ratio, brut)', () => {
    expect(computeRemiseLabel(F({ promoLabel: '28' }))).toBe('-28%')
    expect(computeRemiseLabel(F({ promoLabel: '0.28' }))).toBe('-28%')
    expect(computeRemiseLabel(F({ promoLabel: '3 achetés = 1 offert' }))).toBe('3 achetés = 1 offert')
  })
  it('repli sur la remise calculée si pas de « Promotion »', () => {
    expect(computeRemiseLabel(F({ remisePct: 25 }))).toBe('-25%')
    expect(computeRemiseLabel(F({}))).toBeUndefined()
  })
})

describe('displayedRemisePct (colonne synthétique « Remise (%) »)', () => {
  it('reflète la remise AFFICHÉE, quelle que soit son origine', () => {
    expect(displayedRemisePct(F({ promoLabel: '28' }))).toBe(28)      // entier → -28% → 28
    expect(displayedRemisePct(F({ promoLabel: '0.28' }))).toBe(28)    // ratio → -28% → 28
    expect(displayedRemisePct(F({ promoLabel: '28%' }))).toBe(28)     // texte « 28% » brut → 28
    expect(displayedRemisePct(F({ remisePct: 25 }))).toBe(25)         // calcul pur prix → 25
  })
  it('null si le badge n’exprime pas un pourcentage', () => {
    expect(displayedRemisePct(F({ promoLabel: 'Lot 3+1' }))).toBeNull()
    expect(displayedRemisePct(F({}))).toBeNull()
  })
})
