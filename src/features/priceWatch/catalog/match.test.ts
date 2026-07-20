// src/features/priceWatch/catalog/match.test.ts
import { describe, it, expect } from 'vitest'
import {
  indexKeysOf, buildMemoryIndex, matchProduct, comparePrices, extractOriginRefs,
  type IndexLookup,
} from './match'
import type { CompetitorListing } from './prestashop'

const listing = (o: Partial<CompetitorListing>): CompetitorListing =>
  ({ url: 'https://c.fr/p.html', name: 'Produit', ...o })

describe('indexKeysOf', () => {
  it('indexe la référence brute et sa forme dépaddée', () => {
    expect(indexKeysOf(listing({ ref: '0306030002' }))).toEqual(['0306030002', '306030002'])
  })
  it('normalise les séparateurs', () => {
    expect(indexKeysOf(listing({ ref: '1137-1069-01' }))).toContain('1137106901')
  })
  it('indexe un code-barres fabricant', () => {
    expect(indexKeysOf(listing({ ref: 'X', gtin13: '4049582772185' }))).toContain('4049582772185')
  })
  it('n’indexe PAS un code-barres interne à la boutique', () => {
    expect(indexKeysOf(listing({ ref: 'ABC123', gtin13: '2100001154035' })))
      .not.toContain('2100001154035')
  })
  it('ignore une référence trop courte', () => {
    expect(indexKeysOf(listing({ ref: 'A2' }))).toEqual([])
  })
})

describe('matchProduct', () => {
  const catalogue = [
    listing({ ref: 'BS691991', price: 98, url: 'https://pm.fr/alternateur.html', name: 'Alternateur Briggs' }),
    listing({ ref: '1137106901', price: 87.52, url: 'https://emc.fr/pump.html', name: 'Pump Pulley' }),
    listing({ ref: 'PM04881', gtin13: '3582321853475', price: 27.48, url: 'https://pm.fr/carbu.html', name: 'Carburateur' }),
  ]
  const lookup = buildMemoryIndex(catalogue)

  it('apparie par référence constructeur', () => {
    const r = matchProduct({ id: 'p1', name: 'Alternateur', ref: 'BS790287' }, 's', lookup)
    expect(r.outcome).toBe('not-found') // réf différente : pas d'appariement approximatif
    const ok = matchProduct({ id: 'p2', name: 'Alternateur', ref: 'BS691991' }, 's', lookup)
    expect(ok.outcome).toBe('matched')
    expect(ok.listing?.price).toBe(98)
    expect(ok.proof?.evidence).toBe('sku')
  })
  it('apparie malgré des séparateurs divergents', () => {
    const r = matchProduct({ id: 'p', name: 'Poulie', ref: '1137-1069-01' }, 's', lookup)
    expect(r.outcome).toBe('matched')
    expect(r.listing?.price).toBe(87.52)
  })
  it('apparie par EAN quand la référence diffère', () => {
    const r = matchProduct({ id: 'p', name: 'Carbu', ref: '5208362', ean: '3582321853475' }, 's', lookup)
    expect(r.outcome).toBe('matched')
    expect(r.proof?.evidence).toBe('gtin13')
  })
  it('signale l’absence de clé exploitable', () => {
    expect(matchProduct({ id: 'p', name: 'Vis' }, 's', lookup).outcome).toBe('no-key')
  })
  it('ne retient rien quand le concurrent n’a pas le produit', () => {
    const r = matchProduct({ id: 'p', name: 'Lame', ref: '9999999' }, 's', lookup)
    expect(r.outcome).toBe('not-found')
    expect(r.listing).toBeUndefined()
  })
  it('rejette un candidat trouvé par l’index mais non prouvé', () => {
    // Collision d'index : la clé dépaddée résout vers un produit qui n'est pas le bon.
    const forged: IndexLookup = (key) => (key === '306030002' ? [listing({ ref: 'AUTRE' })] : undefined)
    const r = matchProduct({ id: 'p', name: 'X', ref: '0306030002' }, 's', forged)
    expect(r.outcome).toBe('not-found')
  })
})

describe('comparePrices', () => {
  it('expose le TTC verbatim et le HT recalculé', () => {
    const c = comparePrices(20.28, listing({ price: 27.9 }))
    expect(c.priceTtc).toBe(27.9)
    expect(c.priceHt).toBe(23.25)
  })
  it('ne convertit pas quand le site déclare un prix HT', () => {
    const c = comparePrices(20, listing({ price: 24, taxIncluded: false }))
    expect(c.priceHt).toBe(24)
    expect(c.priceTtc).toBe(28.8)
  })
  it('convertit le prix barré aussi', () => {
    const c = comparePrices(20, listing({ price: 24, listPrice: 30 }))
    expect(c.listPriceTtc).toBe(30)
  })
  it('calcule l’écart HT et le sens du positionnement', () => {
    const cheaper = comparePrices(20, listing({ price: 30 })) // concurrent 25 HT
    expect(cheaper.deltaHt).toBe(5)
    expect(cheaper.position).toBe('cheaper') // ma source est moins chère
    const dearer = comparePrices(30, listing({ price: 24 })) // concurrent 20 HT
    expect(dearer.deltaHt).toBe(-10)
    expect(dearer.position).toBe('more-expensive')
  })
  it('considère alignés deux prix à quelques centimes près', () => {
    expect(comparePrices(20, listing({ price: 24.05 })).position).toBe('aligned')
  })
  it('reste silencieux sans prix concurrent', () => {
    const c = comparePrices(20, listing({ price: undefined }))
    expect(c.priceTtc).toBeUndefined()
    expect(c.deltaHt).toBeUndefined()
  })
  it('n’invente pas d’écart sans prix source', () => {
    const c = comparePrices(undefined, listing({ price: 24 }))
    expect(c.priceTtc).toBe(24)
    expect(c.deltaHt).toBeUndefined()
    expect(c.position).toBeUndefined()
  })
  it('accepte un taux de TVA dérogatoire', () => {
    expect(comparePrices(10, listing({ price: 10.55 }), { vatRate: 0.055 }).priceHt).toBe(10)
  })
  it('reporte la disponibilité', () => {
    expect(comparePrices(10, listing({ price: 12, availability: 'out-of-stock' })).availability)
      .toBe('out-of-stock')
  })
})

describe('extractOriginRefs', () => {
  it('extrait les références après « Remplace origine: »', () => {
    expect(extractOriginRefs('Lame adaptable pour AL-KO. Remplace origine: 516747, 344769, 117720, 106103.'))
      .toEqual(['516747', '344769', '117720', '106103'])
  })
  it('gère « Origine: » seul, sans se laisser couper par les points d’une référence', () => {
    // « 000.02.501 » et « 00002501 » sont deux écritures de la MÊME référence : elles
    // se normalisent identiquement, une seule est conservée.
    expect(extractOriginRefs('Vis pour tondeuse - Origine: 000.02.501, 00002501.'))
      .toEqual(['000.02.501'])
  })
  it('conserve deux références distinctes séparées par des points de phrase', () => {
    expect(extractOriginRefs('Origine: 00.1857.40, 741-05096. Autre phrase.'))
      .toEqual(['00.1857.40', '741-05096'])
  })
  it('gère les références alphanumériques', () => {
    expect(extractOriginRefs('Remplace origine: ASE04145, E04145, 6323022.'))
      .toEqual(['ASE04145', 'E04145', '6323022'])
  })
  it('ignore les mots sans chiffre', () => {
    expect(extractOriginRefs('Remplace origine: pièce, 12345')).toEqual(['12345'])
  })
  it('déduplique par forme normalisée', () => {
    expect(extractOriginRefs('Origine: 12345, 12345')).toEqual(['12345'])
    expect(extractOriginRefs('Origine: 12-345, 12345')).toEqual(['12-345'])
  })
  it('rend un tableau vide sans mention d’origine', () => {
    expect(extractOriginRefs('Lame de scarificateur électrique FLEURELLE V31EL')).toEqual([])
    expect(extractOriginRefs(null)).toEqual([])
  })
})
