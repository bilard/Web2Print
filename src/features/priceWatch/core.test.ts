import { describe, it, expect } from 'vitest'
import { relationalKey, buildPatternUrl, discoveryQueries, pickCandidate, parsePrice, pushHistory, evaluate, buildMatchPrompt, parseMatchVerdict } from './core'
import type { TrackedProduct, HistoryPoint } from './types'

const base: TrackedProduct = { id: 'p1', name: 'Perceuse X', brand: 'Acme' }

describe('relationalKey', () => {
  it('préfère le SKU', () => {
    expect(relationalKey({ ...base, sku: 'SK1', ean: '123' })).toEqual({ kind: 'sku', value: 'SK1' })
  })
  it('replie sur EAN si pas de SKU', () => {
    expect(relationalKey({ ...base, ean: '123' })).toEqual({ kind: 'ean', value: '123' })
  })
  it('replie sur nom+marque si ni SKU ni EAN', () => {
    expect(relationalKey(base)).toEqual({ kind: 'name', value: 'Acme Perceuse X' })
  })
})

describe('buildPatternUrl', () => {
  it('substitue {sku}', () => {
    expect(buildPatternUrl('https://s.com/p/{sku}', { ...base, sku: 'SK1' })).toBe('https://s.com/p/SK1')
  })
  it('substitue {ean}', () => {
    expect(buildPatternUrl('https://s.com/p/{ean}', { ...base, ean: '3614220123456' }))
      .toBe('https://s.com/p/3614220123456')
  })
  it('rend null si l\'un des deux placeholders manque dans un pattern multi', () => {
    expect(buildPatternUrl('https://s.com/{sku}/{ean}', { ...base, sku: 'SK1' })).toBeNull()
  })
  it('rend null si placeholder manquant côté produit', () => {
    expect(buildPatternUrl('https://s.com/p/{sku}', base)).toBeNull()
  })
  it('encode {name}', () => {
    expect(buildPatternUrl('https://s.com/q?n={name}', base)).toBe('https://s.com/q?n=Perceuse%20X')
  })
  it('rend null si pas de pattern', () => {
    expect(buildPatternUrl(undefined, { ...base, sku: 'SK1' })).toBeNull()
  })
})

describe('discoveryQueries', () => {
  it('SKU/EAN d\'abord, puis marque+nom, scopés au domaine', () => {
    const qs = discoveryQueries('exemple.com', { id: 'p1', name: 'Perceuse X', brand: 'Acme', sku: 'SK1' })
    expect(qs[0]).toBe('site:exemple.com SK1')
    expect(qs[1]).toBe('site:exemple.com Acme Perceuse X')
  })
  it('replie sur EAN si pas de SKU', () => {
    const qs = discoveryQueries('exemple.com', { id: 'p1', name: 'Perceuse X', brand: 'Acme', ean: '3614220123456' })
    expect(qs[0]).toBe('site:exemple.com 3614220123456')
    expect(qs[1]).toBe('site:exemple.com Acme Perceuse X')
  })
  it('sans SKU/EAN : juste marque+nom', () => {
    const qs = discoveryQueries('exemple.com', { id: 'p1', name: 'Perceuse X', brand: 'Acme' })
    expect(qs).toEqual(['site:exemple.com Acme Perceuse X'])
  })
})

describe('pickCandidate', () => {
  const results = [
    { title: 'Autre', url: 'https://autre.com/x', snippet: '' },
    { title: 'Perceuse X — Exemple', url: 'https://exemple.com/p/sk1', snippet: '' },
  ]
  it('garde le premier résultat sur le domaine cible', () => {
    expect(pickCandidate(results, 'exemple.com')).toBe('https://exemple.com/p/sk1')
  })
  it('rend null si aucun résultat sur le domaine', () => {
    expect(pickCandidate([results[0]], 'exemple.com')).toBeNull()
  })
})

describe('parsePrice', () => {
  it('parse « 1 299,90 € »', () => expect(parsePrice('1 299,90 €')).toBe(1299.9))
  it('NaN si illisible', () => expect(Number.isNaN(parsePrice('n/a'))).toBe(true))
})

describe('pushHistory (ring buffer)', () => {
  it('borne à maxLen, garde les plus récents', () => {
    let h: HistoryPoint[] = []
    for (let i = 0; i < 35; i++) h = pushHistory(h, { price: i, at: i }, 30)
    expect(h.length).toBe(30)
    expect(h[0].price).toBe(5)
    expect(h[29].price).toBe(34)
  })
})

describe('evaluate', () => {
  const product = { id: 'p1', name: 'Perceuse X', myPrice: 100 }
  it('alerte positionnement si concurrent sous mon prix', () => {
    const a = evaluate(product, { id: 's1', domain: 'e.com' }, 90, undefined, 0)
    expect(a.some((x) => x.kind === 'positioning')).toBe(true)
  })
  it('alerte variation concurrent au-delà du seuil', () => {
    const a = evaluate(product, { id: 's1', domain: 'e.com' }, 120, 100, 10)
    expect(a.some((x) => x.kind === 'competitor-variation')).toBe(true)
  })
  it('pas d\'alerte variation sous le seuil', () => {
    const a = evaluate(product, { id: 's1', domain: 'e.com' }, 105, 100, 10)
    expect(a.some((x) => x.kind === 'competitor-variation')).toBe(false)
  })
  it('premier relevé : pas d\'alerte variation', () => {
    const a = evaluate(product, { id: 's1', domain: 'e.com' }, 120, undefined, 0)
    expect(a.some((x) => x.kind === 'competitor-variation')).toBe(false)
  })
})

describe('buildMatchPrompt', () => {
  it('inclut nom, marque, sku et un extrait de page', () => {
    const prompt = buildMatchPrompt({ name: 'Perceuse X', brand: 'Acme', sku: 'SK1' }, 'contenu page…')
    expect(prompt).toContain('Perceuse X')
    expect(prompt).toContain('Acme')
    expect(prompt).toContain('SK1')
    expect(prompt).toContain('contenu page')
  })
})

describe('parseMatchVerdict', () => {
  it('lit { confidence }', () => {
    expect(parseMatchVerdict('{"confidence":0.9}')).toBe(0.9)
  })
  it('borne 0..1', () => {
    expect(parseMatchVerdict('{"confidence":5}')).toBe(1)
    expect(parseMatchVerdict('{"confidence":-2}')).toBe(0)
  })
  it('0 si illisible', () => {
    expect(parseMatchVerdict('pas du json')).toBe(0)
  })
})
