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
