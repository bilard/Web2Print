// ⚠⚠ Ce que ces tests protègent : ce qu'un CLIC rapporte. Un graphe affiche « — » pour un
// groupe absent ; si le clic filtrait sur ce tiret, la page se viderait sur une valeur qui
// n'existe dans aucune ligne. Et avec une légende, les libellés d'axe sont dédupliqués :
// l'index cliqué ne pointe plus la ligne du même rang.
import { describe, it, expect } from 'vitest'
import { chartModel } from './chartData'
import type { AggregateResult } from '../../engine/aggregate'

const result = (rows: AggregateResult['rows'], withLegend = false): AggregateResult => ({
  columns: [
    { key: 'brand', labelKey: 'bi.dim.brand', role: 'dimension' },
    ...(withLegend ? [{ key: 'family', labelKey: 'bi.dim.family', role: 'dimension' as const }] : []),
    { key: 'count', labelKey: 'bi.measure.count', role: 'measure', format: 'int' },
  ] as AggregateResult['columns'],
  rows,
})

const label = () => 'Nombre'
const NONE: ReadonlySet<string> = new Set()

describe('ce que le clic rapporte', () => {
  it('rend la valeur BRUTE, pas le libellé affiché', () => {
    const m = chartModel(result([
      { brand: 'Makita', count: 3 },
      { brand: null, count: 2 },
    ]), 'bar', label, NONE)
    expect(m.labels).toEqual(['Makita', '—'])
    expect(m.dimensionValueAt(0)).toBe('Makita')
    // ⚠ Le groupe absent s'affiche « — » mais doit filtrer sur l'ABSENCE : filtrer sur le
    // tiret ne retiendrait aucune ligne et viderait la page sans explication.
    expect(m.dimensionValueAt(1)).toBeNull()
  })

  it('nomme le champ de l’axe, pour que le filtre sache sur quoi porter', () => {
    const m = chartModel(result([{ brand: 'Makita', count: 1 }]), 'bar', label, NONE)
    expect(m.dimensionKey).toBe('brand')
  })

  it('n’a pas d’axe — donc rien à filtrer — sur une tuile à mesure seule', () => {
    const m = chartModel({
      columns: [{ key: 'count', labelKey: 'bi.measure.count', role: 'measure', format: 'int' }],
      rows: [{ count: 7 }],
    } as AggregateResult, 'bar', label, NONE)
    expect(m.dimensionKey).toBeUndefined()
    expect(m.dimensionValueAt(0)).toBeUndefined()
  })

  it('retrouve la bonne valeur malgré la déduplication des libellés d’axe', () => {
    // ⚠ Avec une légende, `labels` est dédupliqué : l'index 1 de l'axe n'est PAS la ligne
    // d'index 1 du résultat. Rapporter `rows[1]` filtrerait sur la mauvaise marque.
    const m = chartModel(result([
      { brand: 'Makita', family: 'Perçage', count: 3 },
      { brand: 'Makita', family: 'Sciage', count: 2 },
      { brand: 'Bosch', family: 'Perçage', count: 5 },
    ], true), 'bar', label, NONE)
    expect(m.labels).toEqual(['Makita', 'Bosch'])
    expect(m.dimensionValueAt(1)).toBe('Bosch')
  })
})
