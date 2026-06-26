// functions/src/workflow/nodes/listProducts.test.ts
import { describe, it, expect } from 'vitest'
import { priceMarkerCount, THIN_LISTING_MARKERS, matchesBrand, parseListingItemList, mergeListing, shouldEscalateToBrowser, ESCALATE_BELOW_COUNT, shouldRetryExtraction, MAX_EXTRACT_TRIES, RETRY_EXTRACT_MIN_CONTENT } from './listProducts'
import { htmlToText } from '../brightData'

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

describe('shouldEscalateToBrowser — escalade rendu JS ciblée (anti-surcoût)', () => {
  it('escalade sur la page PRINCIPALE quand le résultat est maigre (vide OU partiel, ex Leroy Merlin 5)', () => {
    expect(shouldEscalateToBrowser(0, true)).toBe(true)  // grille 100 % JS
    expect(shouldEscalateToBrowser(5, true)).toBe(true)  // partielle (SSR/sponsorisés seuls)
  })
  it('non-régression : une grille normale → PAS d’escalade (zéro surcoût Castorama ~11/Jardiland ~47)', () => {
    expect(shouldEscalateToBrowser(ESCALATE_BELOW_COUNT, true)).toBe(false) // au seuil = pas d'escalade
    expect(shouldEscalateToBrowser(11, true)).toBe(false)
    expect(shouldEscalateToBrowser(47, true)).toBe(false)
  })
  it('garde-fou coût : JAMAIS sur les pages de pagination (peu/0 produit = fin de catalogue, normal)', () => {
    expect(shouldEscalateToBrowser(0, false)).toBe(false)
    expect(shouldEscalateToBrowser(5, false)).toBe(false)
  })
})

describe('shouldRetryExtraction — relance anti faux-négatif du LLM', () => {
  const BIG = RETRY_EXTRACT_MIN_CONTENT + 1
  it('relance : 0 produit sur un contenu riche, page principale (cas Leroy Merlin ~32k → 0/5/24 selon le tirage)', () => {
    expect(shouldRetryExtraction(0, 32000, true, 1)).toBe(true)
    expect(shouldRetryExtraction(0, BIG, true, MAX_EXTRACT_TRIES - 1)).toBe(true)
  })
  it('ne relance pas si des produits ont été trouvés', () => {
    expect(shouldRetryExtraction(5, 32000, true, 1)).toBe(false)
  })
  it('garde-fou coût : pas de relance sur la pagination (0 = fin de catalogue, légitime)', () => {
    expect(shouldRetryExtraction(0, 32000, false, 1)).toBe(false)
  })
  it('garde-fou : contenu réellement maigre → pas de relance (page vraiment vide)', () => {
    expect(shouldRetryExtraction(0, RETRY_EXTRACT_MIN_CONTENT, true, 1)).toBe(false)
  })
  it('plafond de tentatives respecté (1 essai + 2 relances)', () => {
    expect(shouldRetryExtraction(0, 32000, true, MAX_EXTRACT_TRIES)).toBe(false)
  })
})

describe('prémisse de l’escalade : le DOM RENDU porte la grille qu’un shell n’a pas', () => {
  // Échantillon RÉEL de leroymerlin.fr/search?q=tondeuse+ryobi capturé DOM rendu (titres +
  // prix réels). La page expose 539 résultats mais AUCUN JSON-LD (parseListingItemList → 0,
  // cf. assertion plus bas) : c'est donc le chemin LLM. Le Web Unlocker HTTP ne rend que le
  // « shell » ci-dessous (menu/filtres/footer, ~aucun prix) → 0 produit ; le Scraping Browser
  // rend la grille → texte riche en prix au-dessus du seuil d'escalade.
  const REAL_PRODUCTS = [
    'Robot Tondeuse sans Fil 800 m² RTK Vision|899 €', 'Robot Tondeuse sans Fil 300 m² Garage|599 €',
    'Robot Tondeuse sans Fil 1000 m² LiDAR 360°|199 €', 'Robot Tondeuse sans Fil AWD 1600 m²|699 €',
    'Pack tondeuse coupe bordure RYOBI One+ 2x18V|399 €', 'Tondeuse sur batterie 2340W 36V RYOBI Ry36lmxsp46a|490 €',
    'Tondeuse sur batterie 48V GREENWORKS Lm510dsa1|599 €', 'Tondeuse sur batterie RYOBI ONE+ OLM1833B 18V|220 €',
    'Tondeuse sur batterie 48V GREENWORKS Gd48lm41iik4|349 €', 'Pack tondeuse coupe-bordure RYOBI One+ RLM18X33B40|299 €',
    'Scheppach Tondeuse à gazon thermique MS180-51|299 €', 'Tondeuse Robot sans Fil Périphérique Pelouses|199 €',
    'Scheppach Tondeuse à gazon thermique MS161-46|199 €', 'Scheppach Tondeuse à gazon essence MP132-40|199 €',
    'Robot tondeuse sans fil HUSQVARNA Aspire R6V 600m²|1099 €', 'Tondeuse sur batterie 90W 18V RYOBI Ry18lmx37a-150|349 €',
    'Tondeuse sur batterie RYOBI Ry36lmxsp53b-160 l.53|590 €', 'Tondeuse thermique 196CC auto-propulsée|290 €',
    'Tondeuse électrique filaire RYOBI Rlm3313a 1300W|190 €', 'Tondeuse à gazon sans fil 36V Karcher LMO 5-18|449 €',
    'Tondeuse sur batterie RYOBI RY18LMH37A-250 Hybride|390 €', 'Tondeuse sur batterie 450W 36V STIHL 6311-011|209 €',
    'Tondeuse sur batterie 18V RYOBI Rlm18x33b50 l.33|239 €', 'Pack RYOBI débroussailleuse 36V Lithium-ion RBC36X|298 €',
    'Tondeuse poussée RYOBI 18V Brushless coupe 40cm|299 €', 'Pack RYOBI Tondeuse électrique 1300W 33cm RLM13E33|197 €',
    'Tondeuse électrique RYOBI RLM13E33S 1300W 33cm|129 €', 'Tondeuse sur batterie RYOBI 36V coupe 46cm|459 €',
    'Tondeuse thermique RYOBI 196cc tractée 46cm|329 €', 'Robot tondeuse RYOBI RM480 connecté|999 €',
    'Tondeuse RYOBI 18V sans batterie OLM1833H|159 €', 'Tondeuse RYOBI ONE+ 36V double batterie|549 €',
  ]
  const RENDERED = `<html><body><main class="search-results">\n${REAL_PRODUCTS.map((p) => {
    const [title, price] = p.split('|')
    return `<article class="product-tile"><a href="/p/x.prd"><h3>${title}</h3><span class="price">${price}</span></a></article>`
  }).join('\n')}\n</main></body></html>`
  // Ce que le Web Unlocker HTTP ramène : le shell de la SPA (chrome de navigation), sans grille.
  const SHELL = `<html><body><header><nav>Produits Terrasse-jardin Revêtement Chauffage Salle-de-bains
    Aide et contact Me connecter Mes listes Mon panier</nav></header>
    <aside>Filtrer par marque prix disponibilité note des clients fonction mulching</aside>
    <footer>Mentions légales Cookies Accessibilité Nos magasins</footer></body></html>`

  it('le shell (Web Unlocker) est quasi sans prix → 0 produit attendu', () => {
    expect(priceMarkerCount(htmlToText(SHELL))).toBeLessThan(THIN_LISTING_MARKERS)
    expect(parseListingItemList(SHELL)).toEqual([])
  })
  it('le DOM rendu (Scraping Browser) porte la grille : prix > seuil + marque RYOBI présente', () => {
    const text = htmlToText(RENDERED)
    expect(priceMarkerCount(text)).toBeGreaterThanOrEqual(THIN_LISTING_MARKERS)
    expect(/ryobi/i.test(text)).toBe(true)
  })
  it('la page n’a AUCUN JSON-LD → l’extraction passe par le LLM (non testé ici), pas l’ItemList', () => {
    expect(parseListingItemList(RENDERED)).toEqual([]) // confirme : chemin LLM, déterministe vide
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
