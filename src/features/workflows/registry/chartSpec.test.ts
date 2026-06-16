import { describe, it, expect } from 'vitest'
import { aggregateChartData, toChartJsConfig, isChartSpec, type ChartNodeConfig } from './chartSpec'

const columns = [
  { key: 'produit', label: 'Produit' },
  { key: 'prix_a', label: 'Prix A' },
  { key: 'prix_b', label: 'Prix B' },
  { key: 'marque', label: 'Marque' },
]
const rows = [
  { produit: 'Tondeuse', prix_a: '409', prix_b: '399,9', marque: 'Ryobi' },
  { produit: 'Taille-haie', prix_a: '177.49', prix_b: '', marque: 'Ryobi' },
  { produit: 'Sécateur', prix_a: '30.99', prix_b: '29', marque: 'Bosch' },
]

const base: ChartNodeConfig = { chartType: 'bar', xColumn: '', valueColumns: '', aggregation: 'none', title: '' }

describe('aggregateChartData', () => {
  it('agg=none : une catégorie par ligne, séries résolues par libellé', () => {
    const spec = aggregateChartData(rows, columns, { ...base, xColumn: 'Produit', valueColumns: 'Prix A, Prix B' })
    expect(spec.labels).toEqual(['Tondeuse', 'Taille-haie', 'Sécateur'])
    expect(spec.datasets).toHaveLength(2)
    expect(spec.datasets[0]).toEqual({ label: 'Prix A', data: [409, 177.49, 30.99] })
    // « 399,9 » (virgule FR) et vide → nombres ; « 29 » entier.
    expect(spec.datasets[1].data).toEqual([399.9, 0, 29])
  })

  it('résout aussi par clé de colonne', () => {
    const spec = aggregateChartData(rows, columns, { ...base, xColumn: 'produit', valueColumns: 'prix_a' })
    expect(spec.datasets[0].data).toEqual([409, 177.49, 30.99])
  })

  it('agg=sum : regroupe par catégorie et somme', () => {
    const spec = aggregateChartData(rows, columns, { ...base, xColumn: 'Marque', valueColumns: 'Prix A', aggregation: 'sum' })
    expect(spec.labels).toEqual(['Ryobi', 'Bosch'])
    expect(spec.datasets[0].data).toEqual([409 + 177.49, 30.99])
  })

  it('agg=avg : moyenne par catégorie', () => {
    const spec = aggregateChartData(rows, columns, { ...base, xColumn: 'Marque', valueColumns: 'Prix A', aggregation: 'avg' })
    expect(spec.datasets[0].data[0]).toBeCloseTo((409 + 177.49) / 2)
    expect(spec.datasets[0].data[1]).toBeCloseTo(30.99)
  })

  it('agg=count : nombre par catégorie (valueColumns ignoré)', () => {
    const spec = aggregateChartData(rows, columns, { ...base, xColumn: 'Marque', valueColumns: '', aggregation: 'count' })
    expect(spec.labels).toEqual(['Ryobi', 'Bosch'])
    expect(spec.datasets).toEqual([{ label: 'Nombre', data: [2, 1] }])
  })
})

describe('toChartJsConfig', () => {
  it('aire → type line + fill', () => {
    const spec = aggregateChartData(rows, columns, { ...base, chartType: 'area', xColumn: 'Produit', valueColumns: 'Prix A' })
    const cfg = toChartJsConfig(spec)
    expect(cfg.type).toBe('line')
    expect((cfg.data as { datasets: { fill: boolean }[] }).datasets[0].fill).toBe(true)
  })

  it('camembert → une couleur par tranche', () => {
    const spec = aggregateChartData(rows, columns, { ...base, chartType: 'pie', xColumn: 'Produit', valueColumns: 'Prix A' })
    const cfg = toChartJsConfig(spec)
    expect(cfg.type).toBe('pie')
    const ds = (cfg.data as { datasets: { backgroundColor: string[] }[] }).datasets[0]
    expect(ds.backgroundColor).toHaveLength(3)
  })

  it('isChartSpec reconnaît la sortie', () => {
    const spec = aggregateChartData(rows, columns, { ...base, xColumn: 'Produit', valueColumns: 'Prix A' })
    expect(isChartSpec(spec)).toBe(true)
    expect(isChartSpec({ rows: [] })).toBe(false)
  })
})
