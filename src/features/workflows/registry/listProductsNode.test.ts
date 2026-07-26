import { describe, it, expect } from 'vitest'
import { resolveEan, pickListingUrl, parseListingItemList, parseListingDataLayer, dedupListing, mergeListing, shouldRetryExtraction, MAX_EXTRACT_TRIES, RETRY_EXTRACT_MIN_CONTENT, shouldEscalateToBrowser, ESCALATE_BELOW_COUNT, htmlToText } from './listProductsNode'

describe('shouldEscalateToBrowser — escalade rendu JS sur résultat maigre (parité serveur)', () => {
  it('escalade sur la page principale si maigre (vide ou partiel, ex Leroy Merlin 5)', () => {
    expect(shouldEscalateToBrowser(0, true)).toBe(true)
    expect(shouldEscalateToBrowser(5, true)).toBe(true)
  })
  it('pas d’escalade pour une grille normale (Castorama ~11, Jardiland ~47)', () => {
    expect(shouldEscalateToBrowser(ESCALATE_BELOW_COUNT, true)).toBe(false)
    expect(shouldEscalateToBrowser(11, true)).toBe(false)
    expect(shouldEscalateToBrowser(47, true)).toBe(false)
  })
  it('jamais sur la pagination', () => {
    expect(shouldEscalateToBrowser(0, false)).toBe(false)
    expect(shouldEscalateToBrowser(5, false)).toBe(false)
  })
})

describe('htmlToText — réduction HTML → texte pour le LLM', () => {
  it('retire le markup/scripts mais garde le texte et les marqueurs de prix', () => {
    const html = '<html><head><title>x</title></head><body><script>junk</script><article><h3>Tondeuse RYOBI</h3><span>349 €</span></article></body></html>'
    const t = htmlToText(html)
    expect(t).toContain('Tondeuse RYOBI')
    expect(t).toContain('349 €')
    expect(t).not.toContain('junk')
    expect(t).not.toContain('<')
  })
})

describe('shouldRetryExtraction — relance anti faux-négatif du LLM (parité serveur)', () => {
  it('relance : 0 produit sur contenu riche, page principale', () => {
    expect(shouldRetryExtraction(0, 32000, true, 1)).toBe(true)
  })
  it('ne relance pas si des produits ont été trouvés', () => {
    expect(shouldRetryExtraction(5, 32000, true, 1)).toBe(false)
  })
  it('jamais sur la pagination (0 = fin de catalogue légitime)', () => {
    expect(shouldRetryExtraction(0, 32000, false, 1)).toBe(false)
  })
  it('contenu réellement maigre → pas de relance', () => {
    expect(shouldRetryExtraction(0, RETRY_EXTRACT_MIN_CONTENT, true, 1)).toBe(false)
  })
  it('plafond de tentatives respecté', () => {
    expect(shouldRetryExtraction(0, 32000, true, MAX_EXTRACT_TRIES)).toBe(false)
  })
})

describe('pickListingUrl (découverte page liste par famille)', () => {
  it('préfère la page catégorie, écarte la fiche produit', () => {
    const r = [
      { url: 'https://www.castorama.fr/barbecue-weber-xyz_CAFR.prd', title: 'Barbecue Weber' }, // fiche
      { url: 'https://www.castorama.fr/jardin-et-terrasse/barbecue/cat_id_123.cat', title: 'Barbecue | Castorama' }, // catégorie
    ]
    expect(pickListingUrl(r, 'castorama.fr', 'barbecue')).toBe('https://www.castorama.fr/jardin-et-terrasse/barbecue/cat_id_123.cat')
  })
  it('repli sur le 1er résultat du domaine si aucune liste évidente', () => {
    const r = [{ url: 'https://autre.com/x' }, { url: 'https://www.castorama.fr/page-x' }]
    expect(pickListingUrl(r, 'castorama.fr', 'barbecue')).toBe('https://www.castorama.fr/page-x')
  })
  it('null si rien sur le domaine', () => {
    expect(pickListingUrl([{ url: 'https://autre.com/x' }], 'castorama.fr', 'barbecue')).toBeNull()
  })
})

describe('resolveEan', () => {
  it('REJETTE un EAN du LLM non corroboré (anti-hallucination)', () => {
    // 13 chiffres plausibles mais absents de l'URL/image/nom → inventé → ''
    expect(resolveEan('4892210822604', '', '', '')).toBe('')
    expect(resolveEan('  4892210822604 ', 'img-noean.jpg', 'https://x.fr/p/abc', 'Tondeuse')).toBe('')
  })

  it('garde l’EAN du LLM s’il est corroboré par l’URL/image/nom', () => {
    expect(resolveEan('4892210822604', '', 'https://x.fr/p/4892210822604_CAFR.prd', '')).toBe('4892210822604')
  })

  it('repêche l’EAN dans le chemin image (cas Jardiland)', () => {
    const image = 'https://media.jardiland.com/.../AssetExport/01404817.4892210822604.11922.90028153.jpg'
    expect(resolveEan('', image, 'https://www.jardiland.com/p/...-ryobi-1404817', 'Tondeuse')).toBe('4892210822604')
  })

  it('repêche l’EAN dans l’URL fiche (cas Castorama)', () => {
    const url = 'https://www.castorama.fr/mkp/tondeuse.../4892210822604_CAFR.prd'
    expect(resolveEan('', '', url, 'Tondeuse')).toBe('4892210822604')
  })

  it('retourne "" si aucun code à 13 chiffres nulle part', () => {
    expect(resolveEan('123', 'img-42.jpg', 'https://x.fr/p/abc-1404817', 'Tondeuse 1800W')).toBe('')
  })

  it('REJETTE un id marketplace à 13 chiffres invalide (mauvaise clé EAN-13)', () => {
    // Cas réel jardiland : produit marketplace, EAN absent, le slug d'URL finit par
    // un id produit « 6744473726508 » (checksum EAN-13 KO) → ne doit PAS être pris.
    const url = 'https://www.jardiland.com/p/...-rbc36x2-6744473726508-1e34ab3'
    expect(resolveEan('', '', url, 'RYOBI Débroussailleuse - RBC36X2')).toBe('')
  })

  it('garde un vrai EAN-13 valide dans le chemin image (checksum OK)', () => {
    const image = 'https://media.jardiland.com/.../AssetExport/21355779.4892210254887.11922.jpg'
    expect(resolveEan('', image, 'https://www.jardiland.com/p/x', 'Tondeuse')).toBe('4892210254887')
  })

  it('saute un id invalide et prend le 1er EAN-13 VALIDE de la même source', () => {
    // url avec id marketplace invalide PUIS un vrai EAN valide
    const url = 'https://x.fr/p/rbc36x2-6744473726508-x-4892210254887'
    expect(resolveEan('', '', url, '')).toBe('4892210254887')
  })
})

describe('parseListingItemList (client/DOMParser) — JSON-LD ItemList', () => {
  const html = `<html><head>
    <script type="application/ld+json">{"@type":"Product","name":"Tondeuse Ryobi"}</script>
    <script type="application/ld+json">{"@type":"ItemList","itemListElement":[
      {"item":{"name":"RYOBI RLM18X33B40","url":"https://www.castorama.fr/x/4892210172709_CAFR.prd","sku":"4892210172709","offers":{"price":288.6}}},
      {"item":{"name":"Coupe-bordures Ryobi","url":"https://www.castorama.fr/y.prd","sku":"4892210185754","offers":{"price":399}}}
    ]}</script></head><body></body></html>`

  it('extrait nom + EAN (sku validé) + prix', () => {
    const p = parseListingItemList(html)
    expect(p.length).toBe(2)
    expect(p[0]).toMatchObject({ name: 'RYOBI RLM18X33B40', ean: '4892210172709', price: 288.6 })
  })
  it('sku non-EAN (checksum KO) → ean vide ; pas d’ItemList → vide', () => {
    const bad = `<script type="application/ld+json">{"@type":"ItemList","itemListElement":[{"item":{"name":"X","sku":"1234567890123","offers":{"price":10}}}]}</script>`
    expect(parseListingItemList(bad)[0].ean).toBe('')
    expect(parseListingItemList('<body>rien</body>')).toEqual([])
  })
})

describe('parseListingDataLayer (client) — grille SPA dans <script type=application/json>', () => {
  // Forme réelle Leroy Merlin /search : datalayer analytics `cdl_products_list` enveloppé,
  // URL relative, prix TTC (ati) + HT (tf) dans `offer`, plus un fil d'Ariane à ÉCARTER.
  const html = `<html><head>
    <script type="application/json" class="dataTms">[{"name":"cdl_products_list","value":[
      {"brand":"RYOBI","name":"Tondeuse RYOBI RY18","sku":"82399444","url":"/produits/tondeuse-ryobi-82399444.html","offer":{"unitprice_ati":399,"unitprice_tf":332.5,"initial_price":null}},
      {"brand":"SUNSEEKER","name":"Robot Tondeuse","url":"/produits/robot-549.html","offer":{"unitprice_ati":549,"unitprice_tf":457.5}}
    ]}]</script>
    <script type="application/json">{"breadcrumb":[{"name":"Jardin","url":"/jardin"},{"name":"Tondeuses","url":"/jardin/tondeuses"}]}</script>
  </head><body></body></html>`
  const base = 'https://www.leroymerlin.fr/search?q=tondeuse+ryobi'

  it('extrait les produits (nom/marque/prix TTC/URL absolue), pas le fil d’Ariane', () => {
    const p = parseListingDataLayer(html, base)
    expect(p.length).toBe(2)
    expect(p[0]).toMatchObject({
      name: 'Tondeuse RYOBI RY18', brand: 'RYOBI', price: 399,
      url: 'https://www.leroymerlin.fr/produits/tondeuse-ryobi-82399444.html',
    })
    // prix TTC (ati) choisi, jamais le HT (tf)
    expect(p[0].price).not.toBe(332.5)
    // fil d'Ariane (name+url, sans marque/offre/prix) exclu
    expect(p.some((x) => x.name === 'Jardin' || x.name === 'Tondeuses')).toBe(false)
  })
  it('garde-fou : aucun bloc JSON produit → [] (zéro régression)', () => {
    expect(parseListingDataLayer('<body><script type="application/json">{"foo":1}</script></body>', base)).toEqual([])
    expect(parseListingDataLayer('<body>rien</body>', base)).toEqual([])
  })
  it('dedupListing : union ItemList + datalayer dédupliquée par URL', () => {
    const b = { brand: '', ean: '', price: 0, originalPrice: 0, image: '' }
    const merged = dedupListing([
      { ...b, name: 'A', url: 'https://s/x.html' },
      { ...b, name: 'A bis', url: 'https://s/x.html?ref=2' },
      { ...b, name: 'B', url: 'https://s/y.html' },
    ])
    expect(merged.map((p) => p.name)).toEqual(['A', 'B'])
  })
})

describe('mergeListing (client)', () => {
  const base = { brand: '', ean: '', price: 0, originalPrice: 0, url: '', image: '' }
  it('ItemList prime nom/EAN/prix, LLM apporte le barré', () => {
    const m = mergeListing(
      [{ ...base, name: 'A', ean: '4892210172709', price: 288.6, url: 'https://s/x.prd' }],
      [{ ...base, name: 'a promo', price: 290, originalPrice: 350, url: 'https://s/x.prd' }],
    )
    expect(m.length).toBe(1)
    expect(m[0]).toMatchObject({ ean: '4892210172709', price: 288.6, originalPrice: 350 })
  })
  it('union des produits LLM hors ItemList ; ItemList vide → LLM seul', () => {
    expect(mergeListing([{ ...base, name: 'A', url: 'https://s/a' }], [{ ...base, name: 'B', url: 'https://s/b' }]).length).toBe(2)
    const llm = [{ ...base, name: 'B', url: 'https://s/b' }]
    expect(mergeListing([], llm)).toBe(llm)
  })
})
