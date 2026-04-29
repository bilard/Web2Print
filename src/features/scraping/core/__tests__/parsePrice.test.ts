import { describe, it, expect } from 'vitest'
import { parsePrice } from '../parsers/parsePrice'

describe('parsePrice', () => {
  it('parse "299,00 €"', () => {
    expect(parsePrice('299,00 €')).toEqual({ amount: 299, currency: 'EUR', raw: '299,00 €' })
  })

  it('parse "1 299,99 €"', () => {
    expect(parsePrice('1 299,99 €')).toEqual({ amount: 1299.99, currency: 'EUR', raw: '1 299,99 €' })
  })

  it('parse "$1,299.99"', () => {
    expect(parsePrice('$1,299.99')).toEqual({ amount: 1299.99, currency: 'USD', raw: '$1,299.99' })
  })

  it('parse "£99.50"', () => {
    expect(parsePrice('£99.50')).toEqual({ amount: 99.5, currency: 'GBP', raw: '£99.50' })
  })

  it('parse une valeur sans symbole comme EUR par défaut', () => {
    expect(parsePrice('99.50')).toEqual({ amount: 99.5, currency: 'EUR', raw: '99.50' })
  })

  it('garde raw si amount illisible', () => {
    expect(parsePrice('À partir de 99 €')).toEqual({ amount: 99, currency: 'EUR', raw: 'À partir de 99 €' })
  })

  it('renvoie null pour une chaîne vide', () => {
    expect(parsePrice('')).toBeNull()
  })

  it('renvoie null si aucun nombre détectable', () => {
    expect(parsePrice('Sur devis')).toEqual({ amount: null, currency: 'EUR', raw: 'Sur devis' })
  })
})
