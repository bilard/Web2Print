// Le node apparie SITE PAR SITE, au fil de ses lectures ; les tests et les recalculs
// apparient tout d'un coup. Les deux chemins doivent donner exactement le même résultat —
// sinon le rapport dépendrait de l'ordre dans lequel les index ont été chargés, et deux
// runs sur les mêmes données diraient deux choses.
import { describe, it, expect } from 'vitest'
import { createPairingRun, pairAllSites } from './pairingRun'
import { matrixFromPairing, buildMatrix } from './matrix'
import { reportFromPairing, buildReport } from './report'
import type { SourceProduct } from './match'
import type { CompetitorListing } from './competitorListing'
import { DEFAULT_PAIRING_RULES, type PairingRules } from './pairingRules'

const products: SourceProduct[] = [
  { id: 'p1', name: 'Courroie de coupe', ref: 'BS691991', price: 10 },
  { id: 'p2', name: 'Lame de tondeuse', ref: '181004383', price: 20 },
  // Sans clé : ni référence ni EAN — c'est le compteur `noKey`.
  { id: 'p3', name: 'Article sans référence' },
  // Avec clé, mais qu'aucun site ne porte.
  { id: 'p4', name: 'Filtre à air', ref: 'ZZ999999', price: 5 },
]

const sites = [{ siteId: 's1', domain: 'un.fr' }, { siteId: 's2', domain: 'deux.fr' }]

const index = new Map<string, CompetitorListing[]>([
  ['s1', [
    { url: 'https://un.fr/a', name: 'Courroie de coupe BS691991', ref: 'BS691991', price: 14.4 },
    { url: 'https://un.fr/b', name: 'Lame de tondeuse 181004383', ref: '181004383', price: 18 },
  ]],
  ['s2', [
    { url: 'https://deux.fr/a', name: 'Courroie de coupe BS691991', ref: 'BS691991', price: 11 },
  ]],
])

describe('appariement site par site', () => {
  it('rend la MÊME matrice que l’appariement d’un seul tenant', () => {
    const streamed = createPairingRun(products, { vatRate: 0.2 })
    for (const s of sites) streamed.addSite(s, index.get(s.siteId)!)
    expect(matrixFromPairing(products, sites, streamed, {}))
      .toEqual(buildMatrix(products, sites, index, { vatRate: 0.2 }))
  })

  it('rend le MÊME rapport que l’appariement d’un seul tenant', () => {
    const streamed = createPairingRun(products, { vatRate: 0.2 })
    for (const s of sites) streamed.addSite(s, index.get(s.siteId)!)
    expect(reportFromPairing(products, sites, streamed, {}))
      .toEqual(buildReport(products, sites, index, { vatRate: 0.2 }))
  })

  it('ne dépend pas de l’ORDRE de chargement des sites', () => {
    const a = createPairingRun(products, { vatRate: 0.2 })
    for (const s of sites) a.addSite(s, index.get(s.siteId)!)
    const b = createPairingRun(products, { vatRate: 0.2 })
    for (const s of [...sites].reverse()) b.addSite(s, index.get(s.siteId)!)
    // Les colonnes de la matrice suivent l'ordre des SITES, pas celui des lectures.
    expect(matrixFromPairing(products, sites, b, {})).toEqual(matrixFromPairing(products, sites, a, {}))
    expect(reportFromPairing(products, sites, b, {})).toEqual(reportFromPairing(products, sites, a, {}))
  })

  it('ne retient QUE les appariements prouvés, pas les fiches lues', () => {
    const run = pairAllSites(products, sites, index, { vatRate: 0.2 })
    // 2 produits appariés (p1 sur deux sites, p2 sur un seul) → 3 cellules pour 3 fiches.
    expect([...run.cellsByProduct.keys()].sort()).toEqual([0, 1])
    expect([...run.cellsByProduct.values()].flat()).toHaveLength(3)
  })

  it('distingue « sans clé » de « sans correspondance »', () => {
    const m = buildMatrix(products, sites, index, { vatRate: 0.2 })
    expect(m.matched).toBe(2)
    expect(m.noKey).toBe(1)      // p3 : aucune référence à interroger
    expect(m.unmatched).toBe(1)  // p4 : une clé, mais aucun site ne la porte
  })

  it('mesure le remplissage des fiches PENDANT la lecture, pas après', () => {
    const run = pairAllSites(products, sites, index, {})
    expect(run.auditBySite.get('s1')?.indexed).toBe(2)
    expect(run.auditBySite.get('s1')?.pctPrice).toBe(100)
    expect(run.auditBySite.get('s2')?.indexed).toBe(1)
  })
})

describe('arbitrage ORIGINE ↔ ADAPTABLE (règle métier)', () => {
  // ⚠⚠ Une pièce d'ORIGINE et son équivalent ADAPTABLE portent la MÊME référence
  // constructeur — c'est la définition de l'adaptable. Aucune clé ne les sépare, et tous
  // deux revendiquent la fiche DIRECTEMENT : le rang les laisse à égalité.
  //
  // Deux mécanismes distincts, et il faut les deux :
  //   • le DÉMENTI (`natureVeto`, dans `match.ts`) refuse la paire quand les deux camps
  //     s'affirment CONTRAIRES — c'est le cas franc ;
  //   • l'ARBITRAGE (ici) tranche le cas fréquent où le rival ne dit RIEN : à rang égal,
  //     celui dont la nature répond à celle de la fiche l'emporte sur celui qui se tait.
  // Sans le second, l'ordre du fichier décidait — cas VÉCU sur 123courroies, cf. l'en-tête
  // d'`originYield`.
  const site = [{ siteId: 's1', domain: '123courroies.fr' }]
  const origine: SourceProduct = {
    id: 'o', name: 'Courroie MTD 754-04038', ref: '754-04038', price: 12.48,
    taxo: ['PIECES ORIGINE', 'COURROIES'],
  }
  const adaptable: SourceProduct = {
    id: 'a', name: 'COURROIE LISSE 5/8 1015MM', ref: '754-04038', price: 20.15,
    description: 'Remplace origine: 754-04038',
  }
  /** Le cas le plus fréquent : un produit qui ne qualifie NI son rangement, ni son texte. */
  const muet: SourceProduct = { id: 'm', name: 'Courroie 5/8 1015 mm', ref: '754-04038', price: 18 }

  const pair = (cat: SourceProduct[], listings: CompetitorListing[], rules?: PairingRules) =>
    pairAllSites(cat, site, new Map([['s1', listings]]), rules ? { rules } : {})
  const winnersOf = (cat: SourceProduct[], run: ReturnType<typeof pairAllSites>) =>
    [...run.cellsByProduct.keys()].map((i) => cat[i].id).sort()

  const ficheOrigine: CompetitorListing[] = [
    { url: 'https://123courroies.fr/o', name: 'Courroie MTD 754-04038 — pièce d’origine', ref: '754-04038', price: 12.9 },
  ]
  const ficheAdaptable: CompetitorListing[] = [
    { url: 'https://123courroies.fr/a', name: 'Courroie adaptable pour MTD 754-04038', ref: '754-04038', price: 19.5 },
  ]

  it('une fiche d’ORIGINE revient à la pièce d’origine, pas au produit muet', () => {
    for (const cat of [[muet, origine], [origine, muet]]) {
      const run = pair(cat, ficheOrigine)
      expect(winnersOf(cat, run)).toEqual(['o'])
      expect(run.totals.natureYielded).toBe(1)
    }
  })

  it('une fiche ADAPTABLE revient à l’adaptable — la règle joue dans les DEUX sens', () => {
    for (const cat of [[muet, adaptable], [adaptable, muet]]) {
      const run = pair(cat, ficheAdaptable)
      expect(winnersOf(cat, run)).toEqual(['a'])
      expect(run.totals.natureYielded).toBe(1)
    }
  })

  it('origine et adaptable ne s’apparient JAMAIS : le démenti refuse la paire avant tout arbitrage', () => {
    for (const cat of [[adaptable, origine], [origine, adaptable]]) {
      const run = pair(cat, ficheOrigine)
      expect(winnersOf(cat, run)).toEqual(['o'])
      // Refusée par le démenti (`vetoed`), pas par l'arbitrage : la paire n'a jamais existé.
      expect(run.totals.vetoed).toBe(1)
      expect(run.totals.natureYielded).toBe(0)
    }
  })

  it('ne tranche RIEN quand la fiche se tait — l’ordre du catalogue reprend la main', () => {
    const muette: CompetitorListing[] = [
      { url: 'https://123courroies.fr/x', name: 'Courroie 754-04038', ref: '754-04038', price: 12.48 },
    ]
    for (const cat of [[muet, origine], [origine, muet]]) {
      const run = pair(cat, muette)
      // Les deux prétendants restent : aucun signal ne les départage, et c'est voulu — un
      // silence n'a jamais rien prouvé dans ce dossier.
      expect(winnersOf(cat, run)).toEqual(['m', 'o'])
      expect(run.totals.natureYielded).toBe(0)
    }
  })

  it('le veto de nature désarmé rend EXACTEMENT le comportement d’avant', () => {
    const run = pair([muet, origine], ficheOrigine, { ...DEFAULT_PAIRING_RULES, natureVeto: false })
    expect(winnersOf([muet, origine], run)).toEqual(['m', 'o'])
    expect(run.totals.natureYielded).toBe(0)
  })

  it('appariement site par site et d’un seul tenant tranchent PAREIL', () => {
    const cat = [muet, origine]
    const streamed = createPairingRun(cat, {})
    streamed.addSite(site[0], ficheOrigine)
    expect(reportFromPairing(cat, site, streamed, {}))
      .toEqual(reportFromPairing(cat, site, pair(cat, ficheOrigine), {}))
  })
})
