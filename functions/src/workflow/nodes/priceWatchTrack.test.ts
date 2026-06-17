import { describe, it, expect } from 'vitest'
import {
  relationalKey, buildPatternUrl, discoveryQueries, pickCandidate, evaluate,
  stableId, parseProductsFromSheet, parseSitesConfig, parsePrice,
} from './priceWatchTrack'
import { extractProductIdentity } from '../../scraper/extractProducts'

describe('serveur — logique veille tarifaire (wire-compatible client)', () => {
  it('relationalKey SKU→EAN→nom', () => {
    expect(relationalKey({ id: 'p', name: 'X', brand: 'A', sku: 'S' }).kind).toBe('sku')
    expect(relationalKey({ id: 'p', name: 'X', brand: 'A', ean: 'E' }).kind).toBe('ean')
    expect(relationalKey({ id: 'p', name: 'X', brand: 'A' }).value).toBe('A X')
  })
  it('buildPatternUrl substitue/encode', () => {
    expect(buildPatternUrl('https://s.com/{sku}', { id: 'p', name: 'X', sku: 'S1' })).toBe('https://s.com/S1')
    expect(buildPatternUrl('https://s.com/{sku}', { id: 'p', name: 'X' })).toBeNull()
  })
  it('discoveryQueries scope domaine', () => {
    expect(discoveryQueries('e.com', { id: 'p', name: 'X', brand: 'A', sku: 'S' })[0]).toBe('site:e.com S')
  })
  it('pickCandidate garde le domaine', () => {
    expect(pickCandidate([{ url: 'https://e.com/x' }], 'e.com')).toBe('https://e.com/x')
  })
  it('pickCandidate préfère le candidat portant le SKU/EAN', () => {
    const r = [{ url: 'https://e.com/c/categorie' }, { url: 'https://e.com/p/rbc36x26b' }]
    expect(pickCandidate(r, 'e.com', { sku: 'RBC36X26B' })).toBe('https://e.com/p/rbc36x26b')
    const r2 = [{ url: 'https://e.com/p/accessoire' }, { url: 'https://e.com/p/3700812025181_CAFR.prd' }]
    expect(pickCandidate(r2, 'e.com', { ean: '3700812025181' })).toBe('https://e.com/p/3700812025181_CAFR.prd')
  })
  it('parsePrice : promo (plus bas), milliers FR/EN', () => {
    expect(parsePrice('284,41 €')).toBe(284.41)
    expect(parsePrice('304,38€284,41€')).toBe(284.41) // paire promo → prix facturé (plus bas)
    expect(parsePrice('1 299,90 €')).toBe(1299.9)
    expect(parsePrice('1,299.90')).toBe(1299.9)
    expect(Number.isNaN(parsePrice('n/a'))).toBe(true)
  })
  it('evaluate positionnement + variation', () => {
    expect(evaluate({ id: 'p', name: 'X', myPrice: 100 }, { id: 's', domain: 'e.com' }, 90, undefined, 0)
      .some((a) => a.kind === 'positioning')).toBe(true)
    expect(evaluate({ id: 'p', name: 'X' }, { id: 's', domain: 'e.com' }, 120, 100, 10)
      .some((a) => a.kind === 'competitor-variation')).toBe(true)
  })
  it('stableId nettoie/borne', () => {
    expect(stableId('Bosch GBH 5/40')).toBe('bosch_gbh_5_40')
    expect(stableId('  ')).toBe('x')
  })
  it('parseProductsFromSheet mappe + ignore lignes sans clé + déduplique', () => {
    const rows = [
      { Réf: 'SK1', Désignation: 'Perceuse X', Marque: 'Acme', Prix: '99,90 €' },
      { Réf: '', Désignation: '', Marque: '' },
    ]
    const out = parseProductsFromSheet(rows, { sku: 'Réf', name: 'Désignation', brand: 'Marque', price: 'Prix' })
    expect(out.length).toBe(1)
    expect(out[0]).toMatchObject({ sku: 'SK1', name: 'Perceuse X', myPrice: 99.9, id: 'sk1' })
  })
  it('parseSitesConfig parse domaine + champs (défaut price)', () => {
    const out = parseSitesConfig('exemple.com\nhttps://autre.fr/x | price, availability')
    expect(out[0]).toMatchObject({ domain: 'exemple.com', fields: ['price'] })
    expect(out[1]).toMatchObject({ domain: 'autre.fr', fields: ['price', 'availability'] })
  })
})

describe('extractProductIdentity (JSON-LD fiche, déterministe)', () => {
  const ld = (obj: unknown) =>
    `<html><head><script type="application/ld+json">${JSON.stringify(obj)}</script></head><body>x</body></html>`

  it('lit name + gtin13 + offers.price (cas Castorama)', () => {
    const id = extractProductIdentity(ld({
      '@type': 'Product',
      name: 'Pack RYOBI débroussailleuse RBC36X26B RAC114',
      gtin13: '3700812025181',
      offers: { '@type': 'Offer', price: 284.41, priceCurrency: 'EUR' },
    }))
    expect(id).toEqual({ name: 'Pack RYOBI débroussailleuse RBC36X26B RAC114', ean: '3700812025181', price: 284.41, brand: '' })
  })

  it('ignore un gtin non-13 et renvoie le Product dans @graph', () => {
    const id = extractProductIdentity(ld({ '@graph': [
      { '@type': 'BreadcrumbList' },
      { '@type': 'Product', name: 'X', gtin: '123', offers: { price: '99.9' } },
    ] }))
    expect(id).toEqual({ name: 'X', ean: '', price: 99.9, brand: '' })
  })

  it('null si aucun Product', () => {
    expect(extractProductIdentity('<html><body>rien</body></html>')).toBeNull()
  })
})
