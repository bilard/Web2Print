import { describe, it, expect } from 'vitest'
import { filterRows, matchesExplorerQuery, buildTokenIndex, suggest, EMPTY_EXPLORER_FILTER } from './filters'
import { pairSiteListings, type PairedRow } from './pairing'
import type { SourceProduct } from '../catalog/match'
import type { CompetitorListing } from '../catalog/competitorListing'

const products: SourceProduct[] = [
  { id: 'p1', name: 'Courroie tondeuse autoportée', ref: 'ABC-123', ean: '4049582395377', price: 100 },
  { id: 'p2', name: 'Filtre à air moteur', ref: 'XYZ-9', ean: '3701234567890', price: 50 },
]
const listings: CompetitorListing[] = [
  { url: 'https://c.fr/a', name: 'Courroie tondeuse ABC-123', ref: 'ABC-123', price: 108, listPrice: 130, availability: 'in-stock' },
  { url: 'https://c.fr/b', name: 'Filtre air moteur thermique', gtin13: '3701234567890', price: 48, availability: 'out-of-stock' },
  { url: 'https://c.fr/c', name: 'Lame de tondeuse universelle', ref: 'ZZZ', price: 25 },
]
const rows: PairedRow[] = pairSiteListings(products, 's1', listings, { vatRate: 0.2 })

describe('matchesExplorerQuery', () => {
  it('trouve par EAN F1 même si le concurrent ne publie pas de code-barres', () => {
    const r = rows.find((x) => x.key.endsWith('/a'))!
    expect(matchesExplorerQuery(r, '4049582395377')).toBe(true)
  })

  it('tolère les séparateurs de saisie dans un code-barres', () => {
    const r = rows.find((x) => x.key.endsWith('/a'))!
    expect(matchesExplorerQuery(r, '4 049582 395377')).toBe(true)
    expect(matchesExplorerQuery(r, '4049582-395377')).toBe(true)
  })

  it('exige TOUS les mots saisis, sur les deux côtés de la ligne', () => {
    const r = rows.find((x) => x.key.endsWith('/b'))!
    expect(matchesExplorerQuery(r, 'filtre moteur')).toBe(true)
    expect(matchesExplorerQuery(r, 'filtre courroie')).toBe(false)
  })
})

describe('filterRows', () => {
  const f = EMPTY_EXPLORER_FILTER

  it('n’affiche que les fiches appariées par défaut', () => {
    expect(filterRows(rows, f).map((r) => r.key)).toEqual(['https://c.fr/a', 'https://c.fr/b'])
  })

  it('isole les fiches que le concurrent est seul à vendre', () => {
    expect(filterRows(rows, { ...f, pairing: 'orphan' }).map((r) => r.key)).toEqual(['https://c.fr/c'])
  })

  it('sépare « il est moins cher » de « je suis moins cher »', () => {
    // Prix concurrent converti en HT (÷ 1,2) : 108 TTC → 90 HT (< 100), 48 → 40 HT (< 50).
    expect(filterRows(rows, { ...f, gap: 'cheaper' })).toHaveLength(2)
    expect(filterRows(rows, { ...f, gap: 'dearer' })).toHaveLength(0)
  })

  it('filtre sur la fourchette de prix HT, les promos et le stock', () => {
    expect(filterRows(rows, { ...f, priceMin: 50 }).map((r) => r.key)).toEqual(['https://c.fr/a'])
    expect(filterRows(rows, { ...f, promoOnly: true }).map((r) => r.key)).toEqual(['https://c.fr/a'])
    expect(filterRows(rows, { ...f, stock: 'out-of-stock' }).map((r) => r.key)).toEqual(['https://c.fr/b'])
  })

  it('cumule les mots-clés de titre (ET logique)', () => {
    expect(filterRows(rows, { ...f, pairing: 'all', tokens: ['tondeuse'] })).toHaveLength(2)
    expect(filterRows(rows, { ...f, pairing: 'all', tokens: ['tondeuse', 'lame'] })).toHaveLength(1)
  })
})

describe('filterRows — fiabilité', () => {
  const f = EMPTY_EXPLORER_FILTER
  // `/a` est prouvé par la réf. déclarée, `/b` par le gtin13. `/c` est orpheline : elle
  // n'a aucun appariement à mettre en doute.
  it('écarte les orphelines de tout filtre de fiabilité', () => {
    expect(filterRows(rows, { ...f, pairing: 'all', trust: 'suspect' }).map((r) => r.key)).not.toContain('https://c.fr/c')
    expect(filterRows(rows, { ...f, pairing: 'all', trust: 'sure' }).map((r) => r.key)).not.toContain('https://c.fr/c')
  })

  it('« sûrs seulement » et « à vérifier » partitionnent les appariés', () => {
    const sure = filterRows(rows, { ...f, trust: 'sure' }).length
    const suspect = filterRows(rows, { ...f, trust: 'suspect' }).length
    expect(sure + suspect).toBe(filterRows(rows, f).length)
  })

  it('trie les moins fiables en tête, orphelines en fin', () => {
    const sorted = filterRows(rows, { ...f, pairing: 'all', worstFirst: true })
    const scores = sorted.map((r) => r.confidence?.score ?? Infinity)
    expect([...scores].sort((a, b) => a - b)).toEqual(scores)
    expect(sorted[sorted.length - 1].key).toBe('https://c.fr/c')
  })

  it('le tri ne change pas ce qui est retenu', () => {
    const plain = filterRows(rows, f).map((r) => r.key).sort()
    const sorted = filterRows(rows, { ...f, worstFirst: true }).map((r) => r.key).sort()
    expect(sorted).toEqual(plain)
  })
})

describe('filterRows — avancement de l’audit', () => {
  const f = EMPTY_EXPLORER_FILTER
  // Verdicts posés à la main : `filterRows` reste pur, l'état Firestore lui est passé.
  const verdictOf = (url: string) => (url.endsWith('/a') ? 'ok' as const : url.endsWith('/b') ? 'ko' as const : null)

  it('isole ce qui reste à statuer, les validés et les rejetés', () => {
    const keys = (audit: 'pending' | 'ok' | 'ko') =>
      filterRows(rows, { ...f, pairing: 'all', audit }, verdictOf).map((r) => r.key)
    expect(keys('ok')).toEqual(['https://c.fr/a'])
    expect(keys('ko')).toEqual(['https://c.fr/b'])
    expect(keys('pending')).toEqual(['https://c.fr/c'])
  })

  it('sans verdicts connus, tout reste à statuer', () => {
    // L'écran peut rendre avant la lecture Firestore : ne rien savoir ne doit pas vider
    // la liste ni faire passer des lignes pour validées.
    expect(filterRows(rows, { ...f, pairing: 'all', audit: 'pending' })).toHaveLength(rows.length)
    expect(filterRows(rows, { ...f, pairing: 'all', audit: 'ok' })).toHaveLength(0)
  })

  it('les trois états partitionnent la liste', () => {
    const n = (audit: 'pending' | 'ok' | 'ko') => filterRows(rows, { ...f, pairing: 'all', audit }, verdictOf).length
    expect(n('pending') + n('ok') + n('ko')).toBe(rows.length)
  })
})

describe('suggestions', () => {
  it('écarte les mots-clés présents partout (ils ne cadrent rien)', () => {
    // « tondeuse » sur les 10 fiches (100 % > plafond 60 %) → écarté ; « special » sur 4.
    const many = Array.from({ length: 10 }, (_, i): CompetitorListing => ({
      url: `https://c.fr/${i}`, name: `Tondeuse ${i}${i < 4 ? ' spécial' : ''}`, price: 10 + i,
    }))
    const idx = buildTokenIndex(pairSiteListings([], 's1', many))
    expect(idx.find((t) => t.token === 'tondeuse')).toBeUndefined()
    expect(idx.find((t) => t.token === 'special')?.count).toBe(4)
  })

  it('propose la référence et le code-barres avant les mots-clés', () => {
    const idx = buildTokenIndex(rows)
    expect(suggest(rows, idx, 'ABC')[0]).toMatchObject({ kind: 'ref', value: 'ABC-123' })
    expect(suggest(rows, idx, '404958')[0]).toMatchObject({ kind: 'ean' })
  })
})
