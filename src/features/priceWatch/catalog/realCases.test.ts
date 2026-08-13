// LES CAS RÉELS, relevés à l'écran par l'utilisateur, un par un, sur des jours.
//
// Raison d'être : chaque signalement était traité isolément, et rien ne garantissait qu'un
// correctif n'en défaisait pas un autre. Ce fichier fige le corpus. Toute règle
// d'appariement qui change doit le laisser vert — c'est le contrat.
//
// ⚠ Chaque cas porte SON verdict attendu, et pourquoi. Les données sont recopiées des
// fiches réelles (libellés, références, EAN, prix) : ne les « simplifiez » pas — c'est leur
// forme exacte qui piège le moteur.
import { describe, it, expect } from 'vitest'
import { pairSiteListings } from '../explorer/pairing'
import type { SourceProduct } from './match'
import type { CompetitorListing } from './competitorListing'

/** Une paire produit ↔ fiche, appariée comme l'écran le fait. */
function pair(products: SourceProduct[], listings: CompetitorListing[]) {
  return pairSiteListings(products, 's1', listings, { vatRate: 0.2 })
}

describe('cas réels — appariements JUSTES qui ne doivent plus être condamnés', () => {
  it('fusible STIGA : réf écrite deux fois par le marchand, EAN différent du nôtre', () => {
    // autoportee-discount. Le marchand empile deux écritures de la référence dans son champ
    // et publie SON code-barres. Ni l'un ni l'autre ne contredit quoi que ce soit.
    const [row] = pair(
      [{ id: 'p', name: 'FUSIBLE', ref: '1134-3496-06', ean: '8008989449195', price: 1.22 }],
      [{
        url: 'https://www.autoportee-discount.fr/fusibles/302195-fusible-stiga-1134349606-1134-3496-06.html',
        name: 'Fusible STIGA 1134349606 - 1134-3496-06', ref: '1134349606 - 1134-3496-06',
        gtin13: '8716106588923', price: 1.74,
      }],
    )
    expect(row.source?.id).toBe('p')
    expect(row.confidence?.doubts).not.toContain('ref-conflict')
    expect(row.confidence?.band, 'un appariement littéral ne peut pas être « douteux »').not.toBe('doubt')
  })

  it('rivet STIGA : référence déclarée en clair, code-barres du marchand sans rapport', () => {
    const [row] = pair(
      [{ id: 'p', name: 'POP RIVET 3.2 x 20', ref: '9632-0513-00', ean: '8008989451013', price: 1.31 }],
      [{
        url: 'https://www.autoportee-discount.fr/rivets/1-rivet-stiga-9632051300.html',
        name: 'Rivet STIGA 9632051300', ref: '9632051300', gtin13: '7313323095299', price: 1.82,
      }],
    )
    expect(row.source?.id).toBe('p')
    expect(row.confidence?.band).not.toBe('doubt')
  })

  it('lot de 5 filtres Briggs : les DEUX références d’origine sont chez le marchand', () => {
    // La seconde clé est habillée de la quantité du lot (« 5x697015 ») : c'est elle qui
    // fait de cet appariement une quasi-certitude.
    const [row] = pair(
      [{
        id: 'p', name: 'LOT DE 5 FILTRES BRIGGS ET STRATTON 697015', ref: 'BS4215',
        originRefs: ['4215', '697015'], price: 13.23,
      }],
      [{
        url: 'https://c.fr/prefiltres', name: 'Pré-filtres à air 5x697015 BRIGGS ET STRATTON 4215',
        ref: '4215', price: 33.56,
      }],
    )
    expect(row.source?.id).toBe('p')
    expect(row.confidence?.supports).toContain('second-key')
    expect(row.confidence?.band).not.toBe('doubt')
  })

  it('courroie MTD 754-0240 : la pièce d’origine gagne, et le litige tranché ne la punit plus', () => {
    const [row] = pair(
      [
        { id: 'adapt', name: 'COURROIE LISSE', ref: '3307620', originRefs: ['754-0240'], price: 25 },
        { id: 'orig', name: 'COURROIE MTD', ref: '754-0240', price: 17.94 },
      ],
      [{ url: 'https://c.fr/mtd0240', name: 'Courroie spécifique MTD 754-0240', ref: 'MTD7540240', price: 56.91 }],
    )
    expect(row.source?.id).toBe('orig')
    expect(row.confidence?.doubts).not.toContain('contested')
    expect(row.confidence?.band).not.toBe('doubt')
  })
})

describe('LE CŒUR DU SUJET — adaptable et pièce d’origine ne se confondent pas', () => {
  // Une pièce d'origine et son équivalent adaptable portent la MÊME référence
  // constructeur : ils s'apparient donc tous deux, parfaitement, à la même fiche. Ce qui
  // les départage n'est pas la clé — c'est ce que chaque libellé AFFIRME.
  const fiche = (name: string): CompetitorListing[] =>
    [{ url: 'https://c.fr/f', name, ref: 'MTD7540280', price: 16.08 }]

  const adaptable: SourceProduct = {
    id: 'adapt', name: 'COURROIE LISSE 5/8 52POUCES', ref: '3300173', originRefs: ['754-0280'],
    description: 'Courroie lisse trapézoïdale qualité d’origine MTD, adaptable pour séries 400, 500 et 600.',
    price: 11.9,
  }
  const origine: SourceProduct = {
    id: 'orig', name: 'COURROIE MTD 754-0280', ref: '754-0280',
    description: 'Pièce d’origine constructeur MTD.', price: 14,
  }

  it('la fiche d’une pièce d’ORIGINE revient à la pièce d’origine, pas à l’adaptable', () => {
    const [row] = pair([adaptable, origine], fiche('Courroie MTD 754-0280 — pièce d’origine constructeur'))
    expect(row.source?.id).toBe('orig')
  })

  it('et l’ordre du catalogue ne renverse rien', () => {
    const [row] = pair([origine, adaptable], fiche('Courroie MTD 754-0280 — pièce d’origine constructeur'))
    expect(row.source?.id).toBe('orig')
  })

  it('quand la fiche se tait, l’arbitrage retombe sur la référence — jamais sur un hasard', () => {
    // « Courroie spécifique MTD 754-0280 » n'affirme rien : c'est le rang des références
    // qui décide (la pièce d'origine revendique par sa propre référence).
    const [row] = pair([adaptable, origine], fiche('Courroie spécifique MTD 754-0280'))
    expect(row.source?.id).toBe('orig')
  })

  it('un ADAPTABLE ne s’apparie PAS à une pièce d’origine — même seul au catalogue', () => {
    // Règle métier, énoncée par l'utilisateur : « apparier une adaptable à une origine n'a
    // aucun sens ». Ce ne sont pas les mêmes articles ; l'écart de prix ne mesurerait rien.
    const [row] = pair([adaptable], fiche('Courroie MTD 754-0280 — pièce d’origine constructeur'))
    expect(row.source).toBeNull()
  })

  it('« Remplace origine : … » suffit à dire qu’un produit EST un adaptable', () => {
    // Signal déterministe, sans lexique : déclarer qu'on remplace une pièce, c'est
    // déclarer qu'on n'est pas cette pièce. 15 117 produits du catalogue le portent — sans
    // lui, la règle « origine avec origine » ne s'appliquait presque jamais.
    const muet: SourceProduct = {
      id: 'muet', name: 'COURROIE 5/8 52POUCES', ref: '3300173',
      originRefs: ['754-0280'], price: 11.9, // aucun mot « adaptable » nulle part
    }
    const [row] = pair([muet], fiche('Courroie MTD 754-0280 — pièce d’origine constructeur'))
    expect(row.source).toBeNull()
  })

  it('le RANGEMENT du catalogue prime sur le libellé', () => {
    // Un produit rangé sous « PIÈCES ORIGINE » EST une pièce constructeur, quoi que dise
    // son libellé — et il ne peut donc pas s'apparier à une fiche d'adaptable.
    const range: SourceProduct = {
      id: 'range', name: 'COURROIE 754-0280', ref: '754-0280',
      taxo: ['PIECES-ORIGINE', 'MTD'], price: 14,
    }
    const [row] = pair([range], fiche('Courroie adaptable MTD 754-0280'))
    expect(row.source).toBeNull()
  })

  it('deux adaptables face à face n’avertissent de rien', () => {
    const [row] = pair([adaptable], fiche('Courroie adaptable MTD 754-0280'))
    expect(row.natures).toBeUndefined()
  })
})

describe('cas réels — le champ « Référence » du marchand, dans ses trois formes', () => {
  // Trois écritures relevées chez trois concurrents. Normalisées d'un bloc, elles ne
  // produisaient qu'une bouillie (« 11343496061134349606 ») : ces fiches n'étaient
  // appariables que par raccroc, si l'URL ou le titre portait aussi la référence.
  const listing = (ref: string): CompetitorListing[] =>
    [{ url: 'https://c.fr/fiche', name: 'Pièce sans référence dans le titre', ref, price: 10 }]

  it('deux écritures de la même référence, séparées par un tiret', () => {
    const [row] = pair([{ id: 'p', name: 'FUSIBLE', ref: '1134-3496-06', price: 8 }], listing('1134349606 - 1134-3496-06'))
    expect(row.source?.id).toBe('p')
    expect(row.proof?.evidence).toBe('sku')
  })

  it('référence habillée de la marque', () => {
    const [row] = pair([{ id: 'p', name: 'COURROIE', ref: '754-0280', price: 8 }], listing('MTD7540280'))
    expect(row.source?.id).toBe('p')
    expect(row.proof?.evidence).toBe('sku')
  })

  it('deux références distinctes, énumérées', () => {
    const [row] = pair([{ id: 'p', name: 'KIT', ref: '5127500-80/8', price: 8 }], listing('5127500-00/6, 5127500-80/8'))
    expect(row.source?.id).toBe('p')
  })

  it('mais une bouillie ne prouve toujours rien', () => {
    // Le collage de deux références n'est pas une référence : aucun produit ne doit
    // s'apparier à « 11343496061134349606 » pris comme un tout.
    const [row] = pair([{ id: 'p', name: 'FUSIBLE', ref: '11343496061134349606', price: 8 }], listing('1134349606 - 1134-3496-06'))
    expect(row.source).toBeNull()
  })
})

describe('cas réels — appariements FAUX qui ne doivent pas exister', () => {
  it('tête fil nylon ↔ courroie dentée : clé courte, aucun mot ne confirme', () => {
    // 123courroies. Une référence d'origine de trois chiffres que le marchand déclare
    // aussi : la coïncidence est la règle, pas l'exception. Les deux libellés ne nomment
    // pas la même pièce et n'ont aucun mot en partage — rien ne soutient ce rapprochement.
    const [row] = pair(
      [{
        id: 'p', name: 'TETE FIL NYLON', ref: '1608220', originRefs: ['562'],
        description: 'Tête fil nylon adaptable ECHO - HUSQVARNA - STIHL.', price: 13.23,
      }],
      [{ url: 'https://c.fr/562', name: 'Courroie double dentée 562,5-DS4.5M15', ref: '562', price: 82.93 }],
    )
    expect(row.source, 'un trou vaut mieux qu’un faux prix').toBeNull()
  })

  it('une clé COURTE mais structurée n’échappe pas à la corroboration du libellé', () => {
    // Variante du cas précédent, non observée mais structurellement identique : la clé
    // « 36-25 » porte un tiret, donc elle passait pour « distinctive » et n'exigeait aucune
    // confirmation du libellé. Quatre caractères ne discriminent rien, tiret ou pas.
    const [row] = pair(
      [{ id: 'p', name: 'TETE FIL NYLON', ref: '1608220', originRefs: ['36-25'], price: 13.23 }],
      [{ url: 'https://c.fr/3625', name: 'Courroie double dentée 3625-DS4.5M15', ref: '36-25', price: 82.93 }],
    )
    expect(row.source, 'un trou vaut mieux qu’un faux prix').toBeNull()
  })

  it('l’adaptable ne rafle pas la fiche de la pièce d’origine', () => {
    const [row] = pair(
      [
        { id: 'adapt', name: 'COURROIE LISSE 5/8 1015MM', ref: '3309342', originRefs: ['754-04038'], price: 20.15 },
        { id: 'orig', name: 'COURROIE MTD', ref: '754-04038', price: 18 },
      ],
      [{ url: 'https://c.fr/mtd04038', name: 'Courroie spécifique MTD 754-04038', ref: 'MTD75404038', price: 12.48 }],
    )
    expect(row.source?.id).toBe('orig')
  })

  it('entre deux références d’origine, la variante du code vendu l’emporte', () => {
    const [row] = pair(
      [
        { id: 'adapt', name: 'COURROIE LISSE 5/8 52POUCES', ref: '3300173', originRefs: ['754-0280'], price: 11.9 },
        { id: 'variante', name: 'COURROIE MTD 754-0280A', ref: '754-0280A', originRefs: ['754-0280'], price: 14 },
      ],
      [{ url: 'https://c.fr/mtd0280', name: 'Courroie spécifique MTD 754-0280', ref: 'MTD7540280', price: 19.29 }],
    )
    expect(row.source?.id).toBe('variante')
  })

  it('les faux appariements historiques restent refusés', () => {
    // Trois cas mesurés avant cette session, gardés ici pour qu'aucun assouplissement ne
    // les rouvre : la famille de pièce, le gouffre de prix, la corroboration du libellé.
    const cas: [string, SourceProduct, CompetitorListing][] = [
      ['gicleur ↔ filtre à huile',
        { id: 'a', name: 'GICLEUR CARBURATEUR', ref: '5205002', price: 8 },
        { url: 'https://c.fr/a', name: 'Filtre à huile KOHLER 5205002', ref: '5205002', price: 12 }],
      ['carburateur ↔ mousse pré-filtre (réf dans l’URL)',
        { id: 'b', name: 'CARBURATEUR', ref: '5208301', price: 40 },
        { url: 'https://c.fr/12-mousse-prefiltre-5208301.html', name: 'Mousse pré-filtre à air', price: 9 }],
      ['bague de roue ↔ chaussure de travail (gouffre de prix)',
        { id: 'c', name: 'BAGUE DE ROUE', ref: '7200341', price: 1.91 },
        { url: 'https://c.fr/c', name: 'Chaussure de travail taille 41 GRISPORT 7200341', ref: '7200341', price: 176.32 }],
    ]
    for (const [label, product, listing] of cas) {
      const [row] = pair([product], [listing])
      expect(row.source, label).toBeNull()
    }
  })
})
