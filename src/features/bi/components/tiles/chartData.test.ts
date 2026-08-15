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

describe('la coloration DIVERGENTE', () => {
  // ⚠⚠ Deux teintes NEUTRES, jamais vert et rouge : un écart négatif est bon pour l'acheteur
  // et mauvais pour le vendeur, et le module ne sait pas de quel côté on est. La divergence
  // dit le SIGNE, pas le jugement.
  it('donne une teinte par SIGNE, une seule barre à la fois', () => {
    const m = chartModel(result([
      { brand: 'a', count: -5 }, { brand: 'b', count: 3 }, { brand: 'c', count: -1 },
    ]), 'bar', label, NONE, { diverging: true })
    const colors = m.datasets[0].backgroundColor as string[]
    expect(colors[0]).toBe(colors[2])
    expect(colors[0]).not.toBe(colors[1])
  })

  it('laisse les COURBES tranquilles — une ligne bicolore est illisible', () => {
    const m = chartModel(result([{ brand: 'a', count: -5 }, { brand: 'b', count: 3 }]),
      'line', label, NONE, { diverging: true })
    expect(Array.isArray(m.datasets[0].backgroundColor)).toBe(false)
  })
})

describe('l’empilement à 100 %', () => {
  const twoSeries = (rows: AggregateResult['rows']): AggregateResult => ({
    columns: [
      { key: 'brand', labelKey: 'bi.dim.brand', role: 'dimension' },
      { key: 'family', labelKey: 'bi.dim.family', role: 'dimension' },
      { key: 'count', labelKey: 'bi.measure.count', role: 'measure', format: 'int' },
    ] as AggregateResult['columns'],
    rows,
  })

  it('ramène chaque colonne à cent', () => {
    const m = chartModel(twoSeries([
      { brand: 'a', family: 'x', count: 30 }, { brand: 'a', family: 'y', count: 10 },
    ]), 'bar', label, NONE, { stackPercent: true })
    expect(m.datasets.map((d) => d.data[0])).toEqual([75, 25])
  })

  // ⚠⚠ Le piège des valeurs mêlées : une somme SIGNÉE peut valoir zéro (+50 et -50), et la
  // part deviendrait infinie. Ce sont les valeurs absolues qui font le total.
  it('survit à des valeurs de signes opposés', () => {
    const m = chartModel(twoSeries([
      { brand: 'a', family: 'x', count: 50 }, { brand: 'a', family: 'y', count: -50 },
    ]), 'bar', label, NONE, { stackPercent: true })
    expect(m.datasets.map((d) => d.data[0])).toEqual([50, -50])
  })

  it('ne transforme pas une case ABSENTE en part nulle', () => {
    const m = chartModel(twoSeries([
      { brand: 'a', family: 'x', count: 20 }, { brand: 'b', family: 'y', count: 40 },
    ]), 'bar', label, NONE, { stackPercent: true })
    expect(m.datasets[0].data[1]).toBeNull()
  })
})
