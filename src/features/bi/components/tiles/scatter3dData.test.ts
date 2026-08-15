// ⚠⚠ Ce que ces tests protègent : un nuage 3D qui DISPARAÎT sans un mot. Trois façons d'y
// arriver — un axe constant qui met des NaN dans la géométrie, un axe en euros qui écrase un
// axe en pourcentage contre une arête, et des lignes incomplètes écartées en silence.
import { describe, it, expect } from 'vitest'
import { buildScatter3D } from './scatter3dData'
import type { AggregateResult } from '../../engine/aggregate'

const result = (rows: AggregateResult['rows'], measures = 3): AggregateResult => ({
  columns: [
    { key: 'brand', labelKey: 'bi.dim.brand', role: 'dimension' },
    { key: 'price', labelKey: 'bi.measure.avg', role: 'measure', format: 'eur' },
    { key: 'gap', labelKey: 'bi.measure.median', role: 'measure', format: 'pct' },
    { key: 'filled', labelKey: 'bi.measure.filledPct', role: 'measure', format: 'pct' },
  ].slice(0, 1 + measures) as AggregateResult['columns'],
  rows,
})

describe('les trois mesures', () => {
  it('se tait plutôt que d’aplatir le nuage quand il en manque une', () => {
    expect(buildScatter3D(result([{ brand: 'Makita', price: 10, gap: 2 }], 2))).toBeNull()
  })

  it('prend les trois PREMIÈRES et ignore les suivantes, comme le nuage 2D', () => {
    const m = buildScatter3D({
      columns: [
        ...result([]).columns,
        { key: 'extra', labelKey: 'bi.measure.count', role: 'measure', format: 'int' },
      ] as AggregateResult['columns'],
      rows: [{ brand: 'Makita', price: 10, gap: 2, filled: 80, extra: 999 }],
    })
    expect(m?.axes.z.column.key).toBe('filled')
    expect(m?.points).toHaveLength(1)
  })
})

describe('la normalisation', () => {
  it('ramène chaque axe dans [-1, 1] — un axe en euros n’écrase pas un axe en pourcentage', () => {
    const m = buildScatter3D(result([
      { brand: 'a', price: 0, gap: 0, filled: 0 },
      { brand: 'b', price: 40_000, gap: 100, filled: 50 },
    ]))
    expect(m?.points[0]).toMatchObject({ nx: -1, ny: -1, nz: -1 })
    expect(m?.points[1]).toMatchObject({ nx: 1, ny: 1, nz: 1 })
  })

  it('garde les valeurs BRUTES à côté des coordonnées, pour l’info-bulle', () => {
    const m = buildScatter3D(result([
      { brand: 'Makita', price: 199.9, gap: 12, filled: 80 },
      { brand: 'Bosch', price: 150, gap: 4, filled: 60 },
    ]))
    expect(m?.points[0]).toMatchObject({ x: 199.9, y: 12, z: 80, label: 'Makita' })
  })

  // ⚠⚠ Le cas qui faisait tout disparaître : une mesure constante donne une étendue nulle.
  it('centre un axe CONSTANT au lieu de diviser par zéro', () => {
    const m = buildScatter3D(result([
      { brand: 'a', price: 10, gap: 5, filled: 100 },
      { brand: 'b', price: 20, gap: 5, filled: 100 },
    ]))
    expect(m?.points.every((p) => Number.isFinite(p.ny) && Number.isFinite(p.nz))).toBe(true)
    expect(m?.points.map((p) => p.ny)).toEqual([0, 0])
    expect(m?.points.map((p) => p.depth)).toEqual([0.5, 0.5])
  })

  it('ne pose aucun NaN sur un nuage à UN SEUL point', () => {
    const m = buildScatter3D(result([{ brand: 'seul', price: 7, gap: 3, filled: 42 }]))
    expect(m?.points[0]).toMatchObject({ nx: 0, ny: 0, nz: 0, depth: 0.5 })
  })
})

describe('les lignes incomplètes', () => {
  it('les écarte au lieu de les poser à l’origine, et les COMPTE', () => {
    const m = buildScatter3D(result([
      { brand: 'a', price: 10, gap: 5, filled: 50 },
      { brand: 'b', price: null, gap: 5, filled: 50 },
      { brand: 'c', price: 30, gap: 5, filled: null },
    ]))
    expect(m?.points).toHaveLength(1)
    expect(m?.dropped).toBe(2)
    // ⚠ Les bornes se calculent sur les points RETENUS : compter la ligne écartée
    // étirerait l'axe jusqu'à une valeur que le nuage ne montre pas.
    expect(m?.axes.x).toMatchObject({ min: 10, max: 10 })
  })

  it('survit à un résultat entièrement vide', () => {
    const m = buildScatter3D(result([]))
    expect(m?.points).toEqual([])
    expect(m?.dropped).toBe(0)
  })
})
