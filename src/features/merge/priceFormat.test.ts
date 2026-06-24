import { describe, it, expect } from 'vitest'
import { formatPriceParts } from './priceFormat'

describe('formatPriceParts', () => {
  it('découpe « 84.9 » → 84 € ,90 (2 décimales forcées)', () => {
    const r = formatPriceParts('84.9')
    expect(r?.text).toBe('84€,90')
    expect(r?.segments).toEqual([
      { text: '84', role: 'integer' },
      { text: '€', role: 'currency' },
      { text: ',90', role: 'decimals' },
    ])
  })
  it('entier seul « 84 » → 84€,00', () => {
    expect(formatPriceParts('84')?.text).toBe('84€,00')
  })
  it('virgule décimale « 22,99 » → 22€,99', () => {
    expect(formatPriceParts('22,99')?.text).toBe('22€,99')
  })
  it('espaces de milliers « 1 250,5 » → 1250€,50', () => {
    expect(formatPriceParts('1 250,5')?.text).toBe('1250€,50')
  })
  it('devise déjà présente « 12.99 € » → 12€,99', () => {
    expect(formatPriceParts('12.99 €')?.text).toBe('12€,99')
  })
  it('tronque les décimales trop longues « 84.999 » → 84€,99', () => {
    expect(formatPriceParts('84.999')?.text).toBe('84€,99')
  })
  it('devise paramétrable', () => {
    expect(formatPriceParts('5', '$')?.text).toBe('5$,00')
  })
  it('valeur sans chiffre → null', () => {
    expect(formatPriceParts('—')).toBeNull()
    expect(formatPriceParts('')).toBeNull()
  })
})
