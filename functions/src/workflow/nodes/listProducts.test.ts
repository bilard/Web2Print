// functions/src/workflow/nodes/listProducts.test.ts
import { describe, it, expect } from 'vitest'
import { priceMarkerCount, THIN_LISTING_MARKERS, matchesBrand, parseListingItemList, mergeListing } from './listProducts'

describe('priceMarkerCount — détection de grille produit maigre', () => {
  // Échantillon « maigre » : ce que Jina ramène d'une grille rendue en JS (peu de prix
  // visibles) — calibré sur le cas réel Castorama (~3-11 produits sortis).
  const thin = `
    # Tondeuse Ryobi
    Filtrer par marque, prix, disponibilité…
    Coupe-bordures et tondeuse hybride Ryobi 399 €
    Tondeuse Ryobi RY18LMH37A-250 399,90 €
    Tondeuse Ryobi RY18LMX40B 429,90 €
    Voir tous les résultats
  `
  // Échantillon « riche » : grille complète rendue (un prix par produit), au-delà du seuil.
  const rich = Array.from({ length: 45 }, (_, i) => `Tondeuse Ryobi modèle ${i} ${300 + i},90 €`).join('\n')

  it('compte les marqueurs de prix € (FR/EN)', () => {
    expect(priceMarkerCount('1 299,90 €')).toBeGreaterThanOrEqual(1)
    expect(priceMarkerCount('€399.90')).toBeGreaterThanOrEqual(1)
    expect(priceMarkerCount('aucun prix ici')).toBe(0)
  })

  it('distingue une grille maigre d’une grille riche autour du seuil', () => {
    const t = priceMarkerCount(thin)
    const r = priceMarkerCount(rich)
    expect(t).toBeLessThan(THIN_LISTING_MARKERS) // maigre → déclenche l'escalade Bright Data
    expect(r).toBeGreaterThanOrEqual(THIN_LISTING_MARKERS) // riche → pas d'escalade
  })

  it('garde anti-régression : le contenu vide compte 0 (escalade comme avant)', () => {
    expect(priceMarkerCount('')).toBe(0)
  })
})

describe('matchesBrand — filtre marque', () => {
  it('garde un produit de la marque (via marque OU nom)', () => {
    expect(matchesBrand('Tondeuse RY18LMH37A-250', 'Ryobi', 'ryobi')).toBe(true) // via la colonne marque
    expect(matchesBrand('Tondeuse poussée Ryobi RY18LMX40B', '', 'Ryobi')).toBe(true) // via le nom (marque vide)
  })
  it('écarte un produit hors-marque (Sunseeker dans une recherche Ryobi)', () => {
    expect(matchesBrand('Robot Tondeuse Sunseeker S3', 'Sunseeker', 'ryobi')).toBe(false)
  })
  it('accent/casse-insensible', () => {
    expect(matchesBrand('Désherbeur GÄRDENA', 'Gardena', 'gärdena')).toBe(true)
  })
  it('garde anti-régression : terme vide → garde tout', () => {
    expect(matchesBrand('Robot Sunseeker', 'Sunseeker', '')).toBe(true)
  })
})

describe('parseListingItemList — extraction déterministe JSON-LD ItemList', () => {
  // Structure RÉELLE Castorama (vérifiée sur la page) : ItemList → item{name,url,sku,offers.price}.
  const html = `<html><head>
    <script type="application/ld+json">{"@type":"Product","name":"Tondeuse Ryobi"}</script>
    <script type="application/ld+json">{"@type":"ItemList","numberOfItems":2,"itemListElement":[
      {"item":{"@type":"Product","name":"Tondeuse poussée RYOBI RLM18X33B40","url":"https://www.castorama.fr/x/4892210172709_CAFR.prd","sku":"4892210172709","offers":{"@type":"Offer","price":288.6}}},
      {"item":{"@type":"Product","name":"Coupe-bordures Ryobi","url":"https://www.castorama.fr/y/4892210185754_CAFR.prd","sku":"4892210185754","offers":{"price":399}}}
    ]}</script></head><body></body></html>`

  it('extrait nom + EAN (sku validé) + prix de chaque item', () => {
    const p = parseListingItemList(html)
    expect(p.length).toBe(2)
    expect(p[0]).toMatchObject({ name: 'Tondeuse poussée RYOBI RLM18X33B40', ean: '4892210172709', price: 288.6 })
    expect(p[1].ean).toBe('4892210185754')
  })
  it('écarte un sku non-EAN (checksum invalide) → ean vide', () => {
    const bad = `<script type="application/ld+json">{"@type":"ItemList","itemListElement":[{"item":{"name":"X","sku":"1234567890123","offers":{"price":10}}}]}</script>`
    expect(parseListingItemList(bad)[0].ean).toBe('')
  })
  it('pas d’ItemList → liste vide (repli LLM)', () => {
    expect(parseListingItemList('<html><body>rien</body></html>')).toEqual([])
    expect(parseListingItemList('')).toEqual([])
  })
})

describe('mergeListing — ItemList (canonique) + LLM (barré)', () => {
  it('l’ItemList prime sur nom/EAN/prix, le LLM complète le prix barré', () => {
    const ld = [{ name: 'Ryobi A', ean: '4892210172709', price: 288.6, url: 'https://s/x.prd' }]
    const llm = [{ name: 'ryobi a promo', ean: '', price: 290, originalPrice: 350, url: 'https://s/x.prd' }]
    const m = mergeListing(ld, llm)
    expect(m.length).toBe(1)
    expect(m[0]).toMatchObject({ ean: '4892210172709', price: 288.6, originalPrice: 350 })
  })
  it('ajoute les produits LLM absents de l’ItemList (union)', () => {
    const m = mergeListing(
      [{ name: 'A', url: 'https://s/a' }],
      [{ name: 'B', url: 'https://s/b' }],
    )
    expect(m.map((x) => x.name).sort()).toEqual(['A', 'B'])
  })
  it('ItemList vide → LLM seul (non-régression)', () => {
    const llm = [{ name: 'B', url: 'https://s/b' }]
    expect(mergeListing([], llm)).toBe(llm)
  })
})
