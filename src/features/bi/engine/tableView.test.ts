// ⚠⚠ Ce que ces tests protègent : une barre qui ment sur les proportions, et une colonne
// vide qui occupe la largeur d'une colonne utile.
import { describe, it, expect } from 'vitest'
import { usefulColumns, barScale, barGeometry } from './tableView'
import type { AggregateResult } from './aggregate'

type Column = AggregateResult['columns'][number]
const dim: Column = { key: 'domain', labelKey: 'bi.dim.competitor', role: 'dimension' }
const m = (key: string): Column => ({ key, labelKey: 'bi.measure.count', role: 'measure', format: 'int' })

describe('colonnes utiles', () => {
  it('retire une colonne de mesure dont AUCUNE ligne ne porte de valeur', () => {
    // Vu dans le détail d'un catalogue : « Référence secondaire », cinq cents tirets à la suite.
    const rows = [{ domain: 'a.fr', a: 12, b: null }, { domain: 'b.fr', a: 3, b: null }]
    const kept = usefulColumns([dim, m('a'), m('b')], rows).map((c) => c.key)
    expect(kept).toEqual(['domain', 'a'])
  })

  it('garde une colonne dont UNE SEULE ligne porte une valeur', () => {
    // Une valeur sur cinq cents lignes reste une information — c'est même souvent LA ligne
    // qu'on cherchait.
    const rows = [{ domain: 'a.fr', a: null }, { domain: 'b.fr', a: 7 }]
    expect(usefulColumns([dim, m('a')], rows).map((c) => c.key)).toEqual(['domain', 'a'])
  })

  it('garde TOUJOURS les dimensions, même sans une seule valeur', () => {
    // C'est l'axe du tableau : le lecteur doit voir que le groupe existe, fût-il anonyme.
    const rows = [{ domain: null, a: 1 }]
    expect(usefulColumns([dim, m('a')], rows).map((c) => c.key)).toEqual(['domain', 'a'])
  })

  it('ne retire rien d’un tableau sans ligne : on ne conclut pas sur du vide', () => {
    expect(usefulColumns([dim, m('a')], [])).toHaveLength(2)
  })
})

describe('échelle des barres', () => {
  it('part de ZÉRO, jamais du minimum observé', () => {
    // Sinon 95 et 100 se dessineraient l'un minuscule, l'autre plein — un écart de 5 % lu
    // comme un rapport de un à vingt.
    const scale = barScale([{ a: 95 }, { a: 100 }], 'a')!
    expect(scale).toEqual({ min: 0, max: 100 })
    expect(barGeometry(95, scale).width).toBe(95)
  })

  it('ouvre l’échelle vers le bas quand la colonne porte des négatifs', () => {
    const scale = barScale([{ a: -20 }, { a: 60 }], 'a')!
    expect(scale).toEqual({ min: -20, max: 60 })
    const zero = barGeometry(0, scale).left
    expect(zero).toBeCloseTo(25) // 20 sur une amplitude de 80
    const neg = barGeometry(-20, scale)
    expect(neg.negative).toBe(true)
    expect(neg.left).toBeCloseTo(0)
    expect(neg.width).toBeCloseTo(25)
  })

  it('⚠ ne trace RIEN sur une colonne constante', () => {
    // « 100 % » sur vingt lignes ferait vingt barres pleines : elles n'apprennent rien et
    // écrasent visuellement les colonnes qui, elles, varient.
    expect(barScale([{ a: 100 }, { a: 100 }, { a: 100 }], 'a')).toBeNull()
  })

  it('ne rend AUCUNE échelle quand rien n’est mesurable', () => {
    // Une barre sur une colonne vide inventerait une proportion.
    expect(barScale([{ a: null }, { a: 'x' }], 'a')).toBeNull()
    expect(barScale([{ a: 0 }, { a: 0 }], 'a')).toBeNull()
  })
})
