// ⚠⚠ Ce que ces tests protègent : le choix qui décourageait. Il fallait combiner trois
// sélecteurs — la source, le suivi, la base produits — sans que rien ne dise lequel
// commencer. Une entrée porte désormais la combinaison entière ; si elle se relit mal, le
// tableau se met à lire un jeu de données que personne n'a désigné.
import { describe, it, expect } from 'vitest'
import { datasetOptions, datasetValue, parseDataset } from './datasetOptions'

const t = (k: string, p?: Record<string, unknown>) => (p ? `${k}(${JSON.stringify(p)})` : k)
const watches = [{ watchId: 'w1', label: 'F1 Veille' }]
const dbs = [{ docId: 'db1', name: 'Catalogue', rows: 174 }, { docId: 'db2', name: 'Makita', rows: 1 }]

describe('liste des jeux de données', () => {
  it('groupe la veille et les bases produits, feuille ouverte comprise', () => {
    const opts = datasetOptions(watches, dbs, t)
    const groups = [...new Set(opts.map((o) => o.group))]
    expect(groups).toEqual(['bi.dataset.watchGroup', 'bi.dataset.pimGroup'])
    // Trois angles de veille, puis la feuille ouverte et les deux bases.
    expect(opts).toHaveLength(3 + 1 + 2)
  })

  it('NOMME le suivi dans le groupe dès qu’il y en a plusieurs', () => {
    // Sans cela, « Synthèse par concurrent » apparaîtrait deux fois à l'identique.
    const opts = datasetOptions([...watches, { watchId: 'w2', label: 'F2' }], [], t)
    expect(opts[0].group).toContain('F1 Veille')
    expect(opts[3].group).toContain('F2')
  })

  it('accorde le singulier d’une base à une seule ligne', () => {
    const opts = datasetOptions([], dbs, t)
    expect(opts.find((o) => o.id === 'p:db2')!.label).toContain('bi.db.optionOne')
  })

  it('relit une entrée de veille : la source ET le suivi', () => {
    expect(parseDataset('w:w1:watch.summary', dbs))
      .toEqual({ source: 'watch.summary', watchId: 'w1' })
  })

  it('relit une base produits, et la feuille ouverte', () => {
    expect(parseDataset('p:db1', dbs))
      .toEqual({ source: 'pim.products', dbId: 'db1', dbName: 'Catalogue' })
    expect(parseDataset('p:', dbs)).toEqual({ source: 'pim.products', dbId: null })
  })

  it('⚠⚠ REFUSE ce qui ne vient pas de la liste, au lieu de deviner', () => {
    // Un repli deviné ferait lire au tableau un jeu de données que personne n'a désigné.
    expect(parseDataset('w:w1:pim.products', dbs)).toBeNull()
    expect(parseDataset('p:inconnu', dbs)).toBeNull()
    expect(parseDataset('nimporte', dbs)).toBeNull()
    expect(parseDataset('w:', dbs)).toBeNull()
  })

  it('sait dire quelle entrée est ACTIVE', () => {
    expect(datasetValue('watch.catalog', 'w1', undefined)).toBe('w:w1:watch.catalog')
    expect(datasetValue('pim.products', null, 'db1')).toBe('p:db1')
    expect(datasetValue('pim.products', null, undefined)).toBe('p:')
  })

  it('⚠ un identifiant de suivi contenant « : » se relit quand même', () => {
    // Les watchId viennent d'ailleurs : rien ne garantit qu'ils soient simples.
    expect(parseDataset('w:a:b:watch.site', dbs))
      .toEqual({ source: 'watch.site', watchId: 'a:b' })
  })
})
