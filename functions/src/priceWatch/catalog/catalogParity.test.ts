// functions/src/priceWatch/catalog/catalogParity.test.ts
// Les modules purs de ce dossier sont DUPLIQUÉS depuis src/features/priceWatch/catalog/
// (client/serveur ne partagent pas le code). Ce test de parité exerce les fonctions clés
// côté serveur : il garde-fou contre une dérive silencieuse de la copie, et couvre les
// exports que seule la suite client utilisait autrement.
import { describe, it, expect } from 'vitest'
import {
  parsePriceFragment, splitProductBlocks, extractAvailability,
  parseJsonLdObjects, parseProductPage, parseListingPage,
} from './prestashop'
import { candidateKeys, proveMatch, refTokensFromUrl } from './keys'
import { indexKeysOf, buildMemoryIndex, matchProduct, dedupeListings, extractOriginRefs } from './match'
import { foldText, keywordsForFamilies } from './categories'
import { MAX_PAGES_PER_CATEGORY, initCursor, advance } from './harvest'
import { planCategories, type CompetitorConfig, type HarvestDeps } from './runHarvest'
import { searchUrl, directedPass, searchProductOnSite } from './searchDirected'
import { DEFAULT_PAIRING_RULES, resolvePairingRules, rulesDifferFromDefault, summarizeRules } from './pairingRules'
import { pickDisplayColumns, taxoPathOf, trimDescription } from './displayColumns'
import { parseListingDomCards } from './genericCards'

describe('prestashop (parité serveur)', () => {
  it('parse les prix marchands', () => {
    expect(parsePriceFragment('4,67 € TTC')).toBe(4.67)
    expect(parsePriceFragment('1 299,90 €')).toBe(1299.9)
    expect(parsePriceFragment('Prix sur demande')).toBeUndefined()
  })
  it('splitProductBlocks : vide sans produit', () => {
    expect(splitProductBlocks('<p>Aucun résultat</p>')).toEqual([])
  })
  it('extractAvailability : schema.org et libellés FR', () => {
    expect(extractAvailability('schema.org/InStock')).toBe('in-stock')
    expect(extractAvailability('<span>Rupture de stock</span>')).toBe('out-of-stock')
  })
  it('parseJsonLdObjects : tolère un bloc invalide', () => {
    const html = `<script type="application/ld+json">{ invalide }</script>
      <script type="application/ld+json">{"@type":"Product","name":"OK"}</script>`
    expect(parseJsonLdObjects(html)).toHaveLength(1)
  })
  it('parseProductPage : lit un JSON-LD Product', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Product', name: 'Carburateur', sku: 'PM04881', gtin13: '3582321853475',
      offers: { price: '27.48', priceCurrency: 'EUR', availability: 'https://schema.org/InStock' },
    })}</script>`
    expect(parseProductPage(html, 'https://x.fr/p.html')).toMatchObject({
      name: 'Carburateur', ref: 'PM04881', price: 27.48, availability: 'in-stock',
    })
  })
})

describe('match (parité serveur)', () => {
  it('indexe et apparie par égalité exacte', () => {
    const listings = [{ url: 'https://x.fr/a.html', name: 'Alternateur', ref: 'BS691991', price: 98 }]
    expect(indexKeysOf(listings[0])).toContain('BS691991')
    const lookup = buildMemoryIndex(listings)
    const r = matchProduct({ id: 'a', name: 'Alternateur', ref: 'BS691991' }, 's', lookup)
    expect(r.outcome).toBe('matched')
  })
  it('apparie une réf constructeur lue en fin de libellé', () => {
    const lookup = buildMemoryIndex([
      { url: 'https://x.fr/a.html', name: 'Courroie tondeuse autoportée VIKING 6151-704-2110', price: 8.4 },
    ])
    const r = matchProduct({ id: 'a', name: 'Courroie', originRefs: ['6151-704-2110'] }, 's', lookup)
    expect(r.outcome).toBe('matched')
    expect(r.proof?.evidence).toBe('ref-in-title')
  })
  it('refuse un appariement que le LIBELLÉ dément', () => {
    // Le cron doit rejeter ce que le navigateur rejette : sans ce veto côté serveur, un
    // recalcul nocturne réintroduirait « CARBURATEUR » ↔ « Mousse pré-filtre à air ».
    const lookup = buildMemoryIndex([
      { url: 'https://x.fr/12-mousse-prefiltre-air-5208301.html', name: 'Mousse pré-filtre à air CUB CADET', price: 9.9 },
    ])
    expect(lookup('5208301')).toHaveLength(1)
    expect(matchProduct({ id: 'a', name: 'CARBURATEUR', ref: '5208301' }, 's', lookup).outcome).toBe('not-found')
  })
  it('exige que le libellé CORROBORE, et l’accepte par famille de pièce', () => {
    // Muet des deux côtés : refusé (doctrine « le libellé confirme »).
    const muet = buildMemoryIndex([{ url: 'https://x.fr/14-piece-5208302.html', name: 'CASTELGARDEN 3816005331', price: 12 }])
    expect(matchProduct({ id: 'a', name: 'CARBURATEUR', ref: '5208302' }, 's', muet).outcome).toBe('not-found')
    // « SWITCH BOX BATTERY » ↔ « Boîtier de commutation » : aucun mot commun, même
    // famille — c'est ce que la comparaison de mots bruts ne saurait pas voir.
    const commun = buildMemoryIndex([{ url: 'https://x.fr/15-boitier-5208303.html', name: 'Boîtier de commutation', price: 30 }])
    expect(matchProduct({ id: 'a', name: 'SWITCH BOX BATTERY', ref: '5208303' }, 's', commun).outcome).toBe('matched')
  })
  it('écarte une clé de libellé ambiguë (deux fiches distinctes)', () => {
    const lookup = buildMemoryIndex([
      { url: 'https://x.fr/a.html', name: 'Lame adaptable 181004383 gauche' },
      { url: 'https://x.fr/b.html', name: 'Lame adaptable 181004383 droite' },
    ])
    expect(matchProduct({ id: 'a', name: 'L', ref: '181004383' }, 's', lookup).outcome).toBe('not-found')
  })
  it('déduplique les fiches répétées par la pagination', () => {
    const dup = { url: 'https://x.fr/a.html', name: 'Alternateur', ref: 'BS691991' }
    expect(dedupeListings([dup, dup, { ...dup, url: 'https://x.fr/b.html' }])).toHaveLength(2)
  })
})

describe('categories + harvest (parité serveur)', () => {
  it('foldText retire les accents', () => {
    expect(foldText('Courroies Écrémées')).toBe('courroies ecremees')
  })
  it('mappe les familles vers des mots-clés de slug', () => {
    expect(keywordsForFamilies(['COURROIES'])).toContain('courroie')
  })
  it('le curseur clôt la catégorie au plafond de pages', () => {
    let c = initCursor(['https://x.fr/10-courroies'])
    for (let i = 0; i < MAX_PAGES_PER_CATEGORY + 2; i++) c = advance(c, { hadItems: true, hasNext: true })
    expect(c.done).toBe(true)
  })
})

describe('runHarvest (parité serveur)', () => {
  it('planCategories filtre les catégories par famille depuis l’accueil', async () => {
    const cfg: CompetitorConfig = { siteId: 's', domain: 'x.fr', families: ['COURROIES'] }
    const home =
      '<a href="https://www.x.fr/10-courroies">Courroies</a>' +
      '<a href="https://www.x.fr/20-filtres">Filtres</a>'
    const deps: HarvestDeps = {
      fetchHtml: async () => home,
      loadCursor: async () => null,
      saveCursor: async () => {},
      savePage: async () => {},
    }
    const cats = await planCategories(cfg, deps)
    expect(cats).toEqual(['https://www.x.fr/10-courroies'])
  })
})

describe('searchDirected (parité serveur)', () => {
  it('searchUrl construit l’URL du moteur de recherche PrestaShop', () => {
    expect(searchUrl('jardimax.com', 'A97')).toBe(
      'https://jardimax.com/recherche?controller=search&s=A97',
    )
  })
  it('directedPass avance le curseur du budget même sans résultat', async () => {
    const products = [{ id: 'p0', ref: 'ABC123' }, { id: 'p1', ref: 'DEF456' }]
    const r = await directedPass(products, [{ siteId: 's', domain: 'x.fr' }], 0, 1, {
      fetchHtml: async () => '',
    })
    expect(r.processed).toBe(1)
    expect(r.nextCursor).toBe(1)
    expect(r.done).toBe(false)
    expect(r.results).toEqual([])
  })
  it('searchProductOnSite renvoie null sans HTML', async () => {
    const hit = await searchProductOnSite({ ref: 'ABC123' }, 'x.fr', { fetchHtml: async () => null })
    expect(hit).toBeNull()
  })
})

describe('appariement jardimax (parité serveur)', () => {
  it('sku à déclinaison « /0 » prouve la réf principale (proveMatch)', () => {
    const keys = candidateKeys({ ref: '181004383' })
    expect(proveMatch(keys, { sku: '181004383/0' })?.evidence).toBe('sku')
  })
  it('extractRef lit le label « Référence: » en texte libre (via parseListingPage)', () => {
    const card = `<article class="product-miniature">
      <h3 class="product-title"><a href="https://www.jardimax.com/p/134027-lame.html">Lame mulching</a></h3>
      <p>Référence: 181004383/0</p><span class="price">34,90 €</span></article>`
    expect(parseListingPage(card)[0]?.ref).toBe('181004383/0')
  })
  it('directedPass interroge les sites en parallèle', async () => {
    let concurrent = 0, maxConcurrent = 0
    const deps = { fetchHtml: async () => {
      concurrent++; maxConcurrent = Math.max(maxConcurrent, concurrent)
      await new Promise((r) => setTimeout(r, 5)); concurrent--; return null
    } }
    const sites = ['a', 'b', 'c'].map((s) => ({ siteId: s, domain: `${s}.fr` }))
    await directedPass([{ id: 'p', ref: 'REF12345' }], sites, 0, 1, deps)
    expect(maxConcurrent).toBeGreaterThan(1)
  })
})

describe('displayColumns (parité serveur)', () => {
  it('reconnaît les en-têtes du catalogue F1 comme la copie client', () => {
    expect(pickDisplayColumns([
      { key: 'CODE_ARTICLE' }, { key: 'DESCRIPTIF' }, { key: 'PATH_PHOTO' },
      { key: 'FAMILLE' }, { key: 'WEBGROUP_DESC' }, { key: 'PRODUCTGROUP' },
    ])).toEqual({
      description: 'DESCRIPTIF', image: 'PATH_PHOTO',
      taxo: ['FAMILLE', 'WEBGROUP_DESC', 'PRODUCTGROUP'], taxoDeclared: false,
    })
  })
  it('retient TEXT_VENTE plutôt que DESCRIPTION, comme la copie client', () => {
    // Si ce test tombe seul, les deux copies ont divergé : reporter la modification.
    expect(pickDisplayColumns([
      { key: 'LIBELLE' }, { key: 'DESCRIPTION' }, { key: 'TEXT_VENTE' },
    ]).description).toBe('TEXT_VENTE')
  })
  it('coupe le chemin au premier niveau vide et tronque la description', () => {
    expect(taxoPathOf({ A: 'Motoculture', B: '', C: 'X' }, ['A', 'B', 'C'])).toEqual(['Motoculture'])
    expect(trimDescription('x'.repeat(400))?.endsWith('…')).toBe(true)
  })
  it('range UNIVERS au-dessus de FAMILLE, comme la copie client', () => {
    expect(pickDisplayColumns([
      { key: 'UNIVERS' }, { key: 'FAMILLE' }, { key: 'PRODUCTGROUP' }, { key: 'SOUS FAMILLE' },
    ]).taxo).toEqual(['UNIVERS', 'FAMILLE', 'SOUS FAMILLE', 'PRODUCTGROUP'])
  })
  it('déduit l’ordre des niveaux des DONNÉES, comme la copie client', () => {
    const rows = [
      { U: 'Jardin', F: 'Tonte', G: 'Courroie A', S: 'Courroies' },
      { U: 'Jardin', F: 'Taille', G: 'Lame X', S: 'Lames' },
      { U: 'Jardin', F: 'Taille', G: 'Lame Y', S: 'Lames' },
    ]
    const cols = [{ key: 'U', label: 'UNIVERS' }, { key: 'F', label: 'FAMILLE' }, { key: 'G', label: 'PRODUCTGROUP' }, { key: 'S', label: 'SOUS FAMILLE' }]
    expect(pickDisplayColumns(cols, {}, rows).taxo).toEqual(['U', 'F', 'S', 'G'])
  })
  it('respecte la taxonomie SAISIE dans le node, comme la copie client', () => {
    expect(pickDisplayColumns([{ key: 'UNIVERS' }, { key: 'FAMILLE' }], { taxo: 'FAMILLE > UNIVERS' }).taxo)
      .toEqual(['FAMILLE', 'UNIVERS'])
  })
})

describe('extractOriginRefs (parité serveur)', () => {
  it('reconnaît les mêmes formulations élargies que le client', () => {
    expect(extractOriginRefs('Réf. origine : 1134-3496-04')).toEqual(['1134-3496-04'])
    expect(extractOriginRefs('Compatible avec : 181004383/0 et 118801752/0'))
      .toEqual(['181004383/0', '118801752/0'])
    expect(extractOriginRefs('Courroie renforcée, largeur 12 mm.')).toEqual([])
  })
})

describe('genericCards (parité serveur)', () => {
  it('garde le visuel des cartes à conteneur « product… » IMBRIQUÉ, comme la copie client', () => {
    // Le balayage tourne côté SERVEUR : sans ce report, la correction ne profiterait qu'à
    // une collecte lancée depuis le navigateur. Si ce test tombe seul, les copies ont dérivé.
    const card = (id: string, flag: boolean) => `
      <article class="ajax_block_product"><div class="product-container">
        <a class="img_link" href="https://s.test/${id}-c-${id}.html" title="Courroie ${id}">
          <img class="img-fluid" src="https://static.s.test/${id}/c-${id}.jpg" alt="Courroie ${id}" /></a>
        ${flag ? '<div class="product-flag"><div class="text">Produit conseillé</div></div>' : ''}
        <h2><a class="product-name" href="https://s.test/${id}-c-${id}.html">Courroie ${id}</a></h2>
        <span class="price product-price">6,48 € <span>T.T.C.</span></span>
      </div></article>`
    const rows = parseListingDomCards(
      `<div class="products">${card('11', true)}${card('22', false)}</div>`, 'https://s.test/liste')
    expect(rows).toHaveLength(2)
    expect(rows.filter((r) => r.image)).toHaveLength(2)
  })
})

describe('refTokensFromUrl (parité serveur)', () => {
  it('ne découpe pas une référence alphanumérique du slug, comme la copie client', () => {
    // Le balayage et l'appariement tournent AUSSI côté serveur : sans ce report, les
    // appariements faux reviendraient au premier cron. Si ce test tombe seul, dérive.
    expect(refTokensFromUrl('https://x.fr/p/12345-demarreur-kohler-4109806s.html')).toEqual(['4109806S'])
    expect(proveMatch(candidateKeys({ ref: '4109806' }), {
      url: 'https://x.fr/p/12345-demarreur-kohler-4109806s.html', name: 'Démarreur KOHLER 4109806S',
    })).toBeNull()
  })
})

describe('règles d’appariement (parité serveur)', () => {
  // ⚠ Ces valeurs sont des LITTÉRAUX recopiés du client. Le cron applique les mêmes
  // règles que le navigateur ou il ne sert à rien : une dérive ici produirait deux
  // rapports différents pour un même suivi, sans que rien ne le signale.
  it('les défauts reproduisent le comportement historique', () => {
    expect(DEFAULT_PAIRING_RULES).toEqual({
      useOriginRefs: true,
      minRefLen: 3,
      weakRefLen: 5,
      evidence: {
        gtin13: true, 'ean-in-url': true, sku: true, mpn: true,
        'ref-in-name': true, 'ref-in-url': true, 'ref-in-title': true,
      },
      familyVeto: true,
      extraFamilies: {},
      priceAbyssRatio: 21,
      corroborateNumericKeys: true,
      // Défaut HISTORIQUE : la recherche dirigée n'applique que le veto des familles.
      unifyDirectedVetoes: false,
      alignedPct: 1,
      minPriceEur: 1,
      maxDropPct: 60,
    })
  })

  it('un réglage absent ou corrompu retombe sur les défauts, jamais sur zéro', () => {
    expect(resolvePairingRules()).toEqual(DEFAULT_PAIRING_RULES)
    expect(resolvePairingRules({ priceAbyssRatio: Number.NaN }).priceAbyssRatio).toBe(21)
  })

  it('le résumé estampillé dans le rapport nomme les preuves coupées', () => {
    expect(rulesDifferFromDefault(resolvePairingRules())).toBe(false)
    const r = resolvePairingRules({ evidence: { 'ref-in-title': false } as never })
    expect(rulesDifferFromDefault(r)).toBe(true)
    expect(summarizeRules(r).evidenceOff).toEqual(['ref-in-title'])
  })

  it('les leviers agissent côté serveur comme côté client', () => {
    const listings = [{ url: 'https://x.fr/a.html', name: 'Courroie VIKING 6151-704-2110', price: 8.4 }]
    const product = { id: 'a', name: 'COURROIE', ref: '6151-704-2110' }
    expect(matchProduct(product, 's', buildMemoryIndex(listings)).outcome).toBe('matched')

    const rules = resolvePairingRules({ evidence: { 'ref-in-title': false } as never })
    expect(matchProduct(product, 's', buildMemoryIndex(listings, rules), rules).outcome).toBe('not-found')
  })
})
