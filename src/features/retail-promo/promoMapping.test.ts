import { describe, it, expect } from 'vitest'
import { defaultPromoFieldMap, extractPromoFields } from './promoMapping'
import type { MergeColumn, MergeRow } from '@/stores/merge.store'

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
})

describe('extractPromoFields', () => {
  it('extrait + calcule la remise, prend la 1re image', () => {
    const row: MergeRow = { _id: '1', ai_name: 'Perceuse', ai_images: 'http://a/1.jpg | http://a/2.jpg', prix_barre: '100 €', prix: '75 €', ean: '123' }
    const f = extractPromoFields(row, cols, defaultPromoFieldMap(cols))
    expect(f.name).toBe('Perceuse')
    expect(f.image).toBe('http://a/1.jpg')
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
