import { test, expect } from 'vitest'
import { toCardData } from './promoCardData'
import type { PromoFields } from './promoTypes'

const base: PromoFields = {
  name: 'X', image: null, brand: '', ref: '', ean: '', oldPrice: null, newPrice: null,
  currency: 'EUR', unit: '', description: '', category: '', unitPrice: '', promoLabel: '',
  mechanism: 'simple', remisePct: null, remiseMontant: null, lotQty: null, lotOffert: null,
  lotPrice: null, validFrom: null, validTo: null, mentions: '', enseigne: '', badges: [],
  extra: { normes: 'EN 388', colis: '6' },
}

test('toCardData : details ordonné par customFields, valeurs seules', () => {
  const d = toCardData({ ...base }, {}, [
    { id: 'colis', label: 'Colis', column: 'c' },
    { id: 'normes', label: 'Normes', column: 'n' },
    { id: 'absent', label: 'SEO', column: 's' },
  ])
  expect(d.details).toEqual(['6', 'EN 388'])
})

test('toCardData expose ean/unit/mentions/enseigne', () => {
  const d = toCardData({ ...base, ean: '123', unit: '/kg', mentions: 'M', enseigne: 'E' }, {}, [])
  expect([d.ean, d.unit, d.mentions, d.enseigne]).toEqual(['123', '/kg', 'M', 'E'])
})
