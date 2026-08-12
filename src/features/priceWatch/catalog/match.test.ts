import { describe, it, expect } from 'vitest'
import {
  indexKeysOf, titleKeysOf, buildMemoryIndex, matchProduct, comparePrices, extractOriginRefs,
  type IndexLookup,
} from './match'
import type { CompetitorListing } from './competitorListing'

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
  it('indexe la réf en tête de titre (emc)', () => {
    const keys = indexKeysOf(listing({ name: '002748 - Courroie pour tondeuse', ref: undefined }))
    expect(keys).toContain('002748')
  })
  it('n’indexe pas un premier mot sans chiffre', () => {
    expect(indexKeysOf(listing({ name: 'Alternateur Briggs', ref: undefined }))).toEqual([])
  })
  it('indexe l’EAN présent dans le slug d’URL (emc)', () => {
    const keys = indexKeysOf(listing({
      url: 'https://emc.fr/courroie/3226-002748-courroie-3582323305460.html', ref: undefined,
    }))
    expect(keys).toContain('3582323305460')
  })
})

describe('titleKeysOf — références lues dans le libellé complet', () => {
  it('indexe la réf constructeur en fin de titre', () => {
    expect(titleKeysOf(listing({ name: 'Courroie tondeuse autoportée VIKING 6151-704-2110' })))
      .toContain('61517042110')
  })
  it('n’émet rien pour un libellé sans référence', () => {
    expect(titleKeysOf(listing({ name: 'Pochette feuilles à joint à découper' }))).toEqual([])
  })
})

describe('buildMemoryIndex — garde-fous d’index', () => {
  it('rend consultable une réf lue dans le titre', () => {
    const idx = buildMemoryIndex([
      listing({ url: 'https://c.fr/a.html', name: 'Courroie autoportée VIKING 6151-704-2110' }),
    ])
    expect(idx('61517042110')).toHaveLength(1)
  })
  it('ÉCARTE une clé de titre ambiguë (deux produits distincts la portent)', () => {
    // Un libellé partagé par deux fiches différentes ne prouve rien : mieux vaut un trou
    // qu'un faux prix. Les clés DÉCLARÉES, elles, restent (collision assumée + preuve).
    const idx = buildMemoryIndex([
      listing({ url: 'https://c.fr/a.html', name: 'Lame adaptable 181004383 gauche' }),
      listing({ url: 'https://c.fr/b.html', name: 'Lame adaptable 181004383 droite' }),
    ])
    expect(idx('181004383')).toBeUndefined()
  })
  it('ne confond pas les doublons de pagination avec une ambiguïté', () => {
    // La même fiche relevée sur deux pages liste = une seule fiche : la clé reste bonne.
    const dup = { url: 'https://c.fr/a.html', name: 'Lame adaptable 181004383 gauche' }
    const idx = buildMemoryIndex([listing(dup), listing(dup)])
    expect(idx('181004383')).toHaveLength(1)
  })
  it('déduplique les fiches répétées et préserve celle qui porte un prix', () => {
    const idx = buildMemoryIndex([
      listing({ url: 'https://c.fr/a.html', ref: 'REF12345' }),
      listing({ url: 'https://c.fr/a.html', ref: 'REF12345', price: 19.9 }),
    ])
    const hits = idx('REF12345')
    expect(hits).toHaveLength(1)
    expect(hits?.[0].price).toBe(19.9)
  })
  it('une clé déclarée l’emporte : le titre n’ajoute pas de candidat parasite', () => {
    const idx = buildMemoryIndex([
      listing({ url: 'https://c.fr/a.html', ref: 'REF12345', name: 'Courroie REF12345' }),
      listing({ url: 'https://c.fr/b.html', name: 'Autre courroie REF12345 compatible' }),
    ])
    expect(idx('REF12345')).toHaveLength(1)
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

  // — Veto du LIBELLÉ : la référence prouve, le nom dément ————————————————
  describe('libellés incompatibles', () => {
    it('refuse « CARBURATEUR » ↔ « Mousse pré-filtre à air » sur une réf. lue dans l’URL', () => {
      // Cas RÉEL : les sept chiffres de la référence F1 figurent dans l'adresse de la
      // fiche du concurrent. La clé résout, `proveMatch` prouve — et les deux articles
      // n'ont rien à voir. Sans veto, ce prix entrait dans le comparatif.
      const idx = buildMemoryIndex([listing({
        url: 'https://c.fr/12-mousse-prefiltre-air-5208301.html',
        name: 'Mousse pré-filtre à air CUB CADET', price: 9.9,
      })])
      // La clé résout bel et bien : sans cette assertion, le test passerait aussi si
      // l'index était simplement vide — il ne prouverait alors plus rien du veto.
      expect(idx('5208301')).toHaveLength(1)
      const r = matchProduct({ id: 'p', name: 'CARBURATEUR', ref: '5208301' }, 's', idx)
      expect(r.outcome).toBe('not-found')
    })

    it('écarte la mauvaise fiche mais garde la BONNE sous la même clé', () => {
      // Le veto porte sur un candidat, pas sur le produit : si le site vend aussi la
      // vraie pièce, elle doit être retenue.
      const forged: IndexLookup = (key) => (key === '5208301' ? [
        listing({ url: 'https://c.fr/12-mousse-5208301.html', name: 'Mousse pré-filtre à air' }),
        listing({ url: 'https://c.fr/13-carbu-5208301.html', name: 'Carburateur adaptable HONDA', price: 21 }),
      ] : undefined)
      const r = matchProduct({ id: 'p', name: 'CARBURATEUR', ref: '5208301' }, 's', forged)
      expect(r.outcome).toBe('matched')
      expect(r.listing?.price).toBe(21)
    })

    it('refuse aussi une référence DÉCLARÉE en champ `sku` — cas mesuré en production', () => {
      // « GICLEUR CARBURATEUR » réf. 5205002 ↔ « Filtre à huile KOHLER … 5205002 » chez
      // cinq marchands. Deux constructeurs emploient le même numéro : seul le libellé
      // départage, et exempter les champs déclarés laissait passer le gros des cas.
      const idx = buildMemoryIndex([listing({
        ref: '5205002', name: 'Filtre à huile KOHLER 52 050 02 - JOHN DEERE AM101207', price: 14,
      })])
      const r = matchProduct({ id: 'p', name: 'GICLEUR CARBURATEUR', ref: '5205002' }, 's', idx)
      expect(r.outcome).toBe('not-found')
      expect(r.vetoed).toBe(1)
    })

    it('n’applique PAS le veto à un code-barres déclaré des deux côtés', () => {
      // Un GTIN identique reste plus probant qu'un titre marchand approximatif : le
      // désaccord de libellé s'y traite en indice de confiance, pas en rejet.
      const idx = buildMemoryIndex([listing({
        ref: 'ZZ1', gtin13: '3582321853475', name: 'Démarreur KOHLER', price: 40,
      })])
      const r = matchProduct({ id: 'p', name: 'FILTRE A AIR', ean: '3582321853475' }, 's', idx)
      expect(r.outcome).toBe('matched')
      expect(r.proof?.evidence).toBe('gtin13')
    })

    it('refuse « BAGUE DE ROUE » ↔ « Chaussure de travail » — le lexique connaît l’EPI', () => {
      const idx = buildMemoryIndex([listing({
        url: 'https://c.fr/22-chaussure-travail-7200341.html',
        name: 'Chaussure de travail taille 41 GRISPORT', price: 211.58,
      })])
      expect(idx('7200341')).toHaveLength(1)
      expect(matchProduct({ id: 'p', name: 'BAGUE DE ROUE', ref: '7200341', price: 1.91 }, 's', idx).outcome)
        .toBe('not-found')
    })

    it('refuse un ABÎME de prix même sans un mot connu de part et d’autre', () => {
      // Filet universel : aucun lexique ne peut tout nommer. ×110 ici.
      const idx = buildMemoryIndex([listing({
        url: 'https://c.fr/23-machin-7200999.html', name: 'Zorglub XR-9 édition limitée', price: 211.58,
      })])
      expect(matchProduct({ id: 'p', name: 'BIDULE', ref: '7200999', price: 1.91 }, 's', idx).outcome)
        .toBe('not-found')
    })

    it('laisse passer un écart de prix ORDINAIRE entre grossiste et détaillant', () => {
      // ×4 : c'est le marché, pas une anomalie. Et ×14 reste toléré (lot de seize).
      // Libellés corroborés : c'est bien le PRIX qu'on éprouve ici.
      const idx = buildMemoryIndex([listing({
        ref: 'ZX-7200998', url: 'https://c.fr/24-machin.html', name: 'Zorglub XR-9', price: 8,
      })])
      expect(matchProduct({ id: 'p', name: 'Zorglub série 9', ref: 'ZX-7200998', price: 1.91 }, 's', idx).outcome)
        .toBe('matched')
      const lot = buildMemoryIndex([listing({
        url: 'https://c.fr/25-couteaux-3568400.html', name: 'Couteaux scarificateurs x16 pour Wolf', price: 41.49,
      })])  // « COUTEAU » ↔ « Couteaux » : même racine, donc corroboré
      expect(matchProduct({ id: 'p', name: 'COUTEAU', ref: '3568400', price: 3.01 }, 's', lot).outcome)
        .toBe('matched')
    })

    it('apparie ENJOLIVEUR ↔ « Protection de Roue Droite » — cas RÉEL emc-motoculture', () => {
      // Même référence (122600092/0) ET même code-barres, mais deux libellés sans un mot
      // en commun. Exiger la corroboration sur TOUTES les clés refusait ce rapprochement
      // parfait : c'est ce que ça coûtait.
      const idx = buildMemoryIndex([listing({
        name: '122600092/0 - Protection de Roue Droite pour Tondeuse Castelgarden / GGP / Stiga',
        ref: '1226000920', price: 3.41,
        url: 'https://c.fr/protection-de-roue/3559-1226000920-protection-roue-8008984359130.html',
      })])
      const r = matchProduct(
        { id: 'p', name: 'ENJOLIVEUR', ref: '122600092/0', ean: '8008984359130', price: 2.92 },
        's', idx,
      )
      expect(r.outcome).toBe('matched')
      expect(r.listing?.price).toBe(3.41)
    })

    it('une référence STRUCTURÉE apparie seule, sans corroboration du libellé', () => {
      // « 520-8302 » porte un séparateur : elle appartient à son constructeur, là où une
      // suite de chiffres nus n'appartient à personne.
      const idx = buildMemoryIndex([listing({
        ref: '520-8302', url: 'https://c.fr/14-piece.html', name: 'CASTELGARDEN 3816005331', price: 12,
      })])
      expect(matchProduct({ id: 'p', name: 'CARBURATEUR', ref: '520-8302' }, 's', idx).outcome)
        .toBe('matched')
    })

    it('REFUSE le même libellé muet quand la clé est une suite de chiffres NUS', () => {
      // Charge de la preuve inversée : « 5208302 » n'appartient à personne. Sans un mot
      // qui corrobore, le rapprochement n'est qu'une coïncidence numérique.
      const idx = buildMemoryIndex([listing({
        url: 'https://c.fr/14-piece-5208302.html', name: 'CASTELGARDEN 3816005331', price: 12,
      })])
      expect(idx('5208302')).toHaveLength(1)
      expect(matchProduct({ id: 'p', name: 'CARBURATEUR', ref: '5208302' }, 's', idx).outcome)
        .toBe('not-found')
    })

    it('accepte une clé NUE dès qu’un mot corrobore — pluriels et dérivés compris', () => {
      const idx = buildMemoryIndex([listing({
        url: 'https://c.fr/16-pinces-2101431.html', name: 'Lot de 10 pinces alligator 50mm', price: 12,
      })])
      // « PINCE » ↔ « pinces » : aucun token identique, même racine.
      expect(matchProduct({ id: 'p', name: 'PINCE ELECTRIQUE', ref: '2101431' }, 's', idx).outcome)
        .toBe('matched')
    })

    it('refuse « BATTERIE » ↔ « Verre pour syphon » — les zéros de tête tombent', () => {
      // Cas RÉEL : réf. F1 60527, adresse du concurrent « 0060527 ». La normalisation
      // rapproche les deux nombres, et plus rien ne les distinguait.
      const idx = buildMemoryIndex([listing({
        url: 'https://c.fr/17-verre-syphon-0060527.html', name: 'Verre pour syphon MZ',
      })])
      expect(matchProduct({ id: 'p', name: 'BATTERIE 12V 105A', ref: '60527' }, 's', idx).outcome)
        .toBe('not-found')
    })

    it('refuse « JEU DE RONDELLES » ↔ « Tête fil nylon » — les tirets tombent', () => {
      // Cas RÉEL : réf. F1 1608115, référence marchand « 160-8115 ».
      const idx = buildMemoryIndex([listing({
        ref: '160-8115', url: 'https://c.fr/18-tete-fil.html',
        name: 'Tête fil nylon universelle EASYLOAD', price: 27.56,
      })])
      expect(matchProduct({ id: 'p', name: 'JEU DE RONDELLES', ref: '1608115', price: 3.8 }, 's', idx).outcome)
        .toBe('not-found')
    })

    it('laisse passer deux libellés qui partagent une famille malgré la langue', () => {
      // « SWITCH BOX BATTERY » ↔ « Boîtier de commutation » : `switch` en commun.
      const idx = buildMemoryIndex([listing({
        url: 'https://c.fr/15-boitier-5208303.html', name: 'Boîtier de commutation', price: 30,
      })])
      const r = matchProduct({ id: 'p', name: 'SWITCH BOX BATTERY', ref: '5208303' }, 's', idx)
      expect(r.outcome).toBe('matched')
    })
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

describe('extractOriginRefs — formulations élargies', () => {
  // Relevé en production : « 0 orig. » sur 16 483 appariés. Sur des pièces adaptables,
  // la référence d'origine est la SEULE clé qu'un concurrent puisse porter.
  const cases: [string, string[]][] = [
    ['Lame adaptable. Remplace origine: 516747, 344769.', ['516747', '344769']],
    ['Courroie. Origine : A97, 135061.', ['A97', '135061']],
    ['Réf. origine : 1134-3496-04', ['1134-3496-04']],
    ['Référence d’origine : 729-05048', ['729-05048']],
    ['Réf constructeur : 21130-2056', ['21130-2056']],
    ['OEM : 000.02.501', ['000.02.501']],
    ['Équivalent : 5032227330047', ['5032227330047']],
    ['Remplace les références : 6151-704-2110', ['6151-704-2110']],
    ['Correspondance : WD40-33004', ['WD40-33004']],
  ]
  it.each(cases)('reconnaît « %s »', (text, expected) => {
    expect(extractOriginRefs(text)).toEqual(expected)
  })

  it('n’invente rien sur une description ordinaire', () => {
    expect(extractOriginRefs('Courroie renforcée pour tondeuse autoportée, largeur 12 mm.')).toEqual([])
    expect(extractOriginRefs('Livraison : 48 heures.')).toEqual([])
  })
})

describe('⚠⚠ une liste de MACHINES compatibles n’est pas une liste de références', () => {
  // Cas remonté du rapport de production : « VERROU TOURNANT » réf. 4100580 apparié au
  // « Pignon pour tronçonneuse Stihl … MS230 » d'autoportee-discount. « compatible avec »
  // et « compatibilité » figuraient dans les formulations lues, si bien que les modèles de
  // machine devenaient des clés de jointure — et un modèle est partagé par TOUTES les
  // pièces qui s'y montent : il apparie donc n'importe laquelle avec n'importe quelle autre.
  const VERROU = 'Verrou tournant pour boîtier de filtre à air compatible avec les modèles '
    + 'STIHL MS210, MS210C-B, MS210C-BE, MS230, MS230-C, MS230C-BE, MS250, MS250C-B, '
    + 'MS250C-BE, MS290, MS290-Z, MS310 & MS390. Remplace origine 1123 141 2301, 11231412301.'

  it('ne retient que la référence annoncée par « Remplace origine »', () => {
    expect(extractOriginRefs(VERROU)).toEqual(['11231412301'])
  })

  it('ignore les formulations de compatibilité, avec ou sans deux-points', () => {
    expect(extractOriginRefs('Compatible avec les modèles STIHL MS210, MS230.')).toEqual([])
    expect(extractOriginRefs('Compatibilité : MS170, MS180, MS181.')).toEqual([])
    // Le prix à payer, assumé et documenté : une VRAIE référence annoncée par un mot de
    // compatibilité n'émet plus de clé. Le catalogue écrit les siennes sous « Remplace ».
    expect(extractOriginRefs('Compatible avec : 181004383/0 et 118801752/0')).toEqual([])
  })

  it('n’apparie plus le verrou au pignon de tronçonneuse', () => {
    const pignon = listing({
      url: 'https://www.autoportee-discount.fr/pignons-de-tronconneuse/32604-pignon-pour-'
        + 'tronconneuse-stihl-017-018-019-021-023-025-ms170-ms180-ms190-ms191-ms192-ms210-'
        + 'ms211-ms230.html',
      name: 'Pignon pour tronçonneuse Stihl 017 - 018 - 019 - 021 - 023 - 025 - MS170 - MS180 '
        + '- MS190 - MS191 - MS192 - MS210 - MS211 - MS230',
      price: 7.92,
    })
    const product = {
      id: '4100580', name: 'VERROU TOURNANT', price: 2.08,
      ref: '4100580', ean: '3582322277775', originRefs: extractOriginRefs(VERROU),
    }
    const res = matchProduct(product, 'autoportee', buildMemoryIndex([pignon]))
    expect(res.outcome).toBe('not-found')
  })
})

describe('⚠⚠ références d’origine citées SANS deux-points', () => {
  it('capte les formulations courantes sans ponctuation', () => {
    // Le deux-points était exigé, et c'est ce qui laissait 105 000 lignes sur 115 814 sans
    // la moindre référence d'origine. Or ces références sont les seules qu'un concurrent
    // puisse porter sur une pièce adaptable : elles produisaient déjà 592 des 974
    // appariements du catalogue, à partir des 9 % de lignes qui portaient un deux-points.
    expect(extractOriginRefs('Lame adaptable AL-KO. Remplace origine 516747, 344769.')).toEqual(['516747', '344769'])
    expect(extractOriginRefs('Courroie. Équivalent 532134149')).toEqual(['532134149'])
    expect(extractOriginRefs('Filtre. Réf. origine – 117720')).toEqual(['117720'])
    expect(extractOriginRefs('Bougie. OEM 106103 et 117720.')).toEqual(['106103', '117720'])
  })

  it('⚠ n’invente rien sur une phrase sans référence', () => {
    // Le garde-fou qui rend l'élargissement sûr : sans chiffre, pas de référence. Et une
    // clé candidate doit de toute façon être PROUVÉE chez le concurrent — on élargit la
    // recherche, jamais l'acceptation.
    expect(extractOriginRefs('Compatible avec les modèles récents de la gamme')).toEqual([])
    expect(extractOriginRefs('Courroie trapézoïdale renforcée pour autoportée')).toEqual([])
  })

  it('la forme avec deux-points continue de fonctionner', () => {
    expect(extractOriginRefs('Remplace origine: 516747, 344769.')).toEqual(['516747', '344769'])
  })
})
