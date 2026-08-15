// ⚠⚠ Ce que ces tests protègent : une TENDANCE qui n'en est pas une. Une tuile triée sur sa
// mesure (un « top 10 ») donnerait une courbe classée du plus grand au plus petit — une
// décroissance parfaite, qui n'est qu'un tri. Et une variation calculée sur un zéro
// inventerait un pourcentage infini.
import { describe, it, expect } from 'vitest'
import { buildKpi, kpiDelta } from './kpiData'
import type { AggregateResult } from '../../engine/aggregate'

const withDim = (rows: AggregateResult['rows']): AggregateResult => ({
  columns: [
    { key: 'month', labelKey: 'bi.dim.column', label: 'Mois', role: 'dimension' },
    { key: 'n', labelKey: 'bi.measure.count', label: 'Fiches', role: 'measure', format: 'int' },
  ] as AggregateResult['columns'],
  rows,
})

describe('sans dimension', () => {
  it('montre la valeur, et aucune courbe', () => {
    const m = buildKpi({
      columns: [{ key: 'n', labelKey: 'bi.measure.count', role: 'measure', format: 'int' }],
      rows: [{ n: 534735 }],
    })
    expect(m.value).toBe(534735)
    expect(m.series).toEqual([])
    expect(m.previous).toBeUndefined()
  })
})

describe('avec une dimension', () => {
  it('montre le DERNIER point et compare au précédent', () => {
    const m = buildKpi(withDim([
      { month: '2026-06', n: 100 }, { month: '2026-07', n: 120 }, { month: '2026-08', n: 150 },
    ]))
    expect(m.value).toBe(150)
    expect(m.previous).toBe(120)
    expect(m.previousLabel).toBe('2026-07')
    expect(m.series).toEqual([100, 120, 150])
  })

  // ⚠⚠ Le cas qui fabrique une fausse tendance : le résultat arrive trié sur la MESURE.
  it('retrie sur la dimension, quel que soit l’ordre du résultat', () => {
    const m = buildKpi(withDim([
      { month: '2026-08', n: 150 }, { month: '2026-06', n: 100 }, { month: '2026-07', n: 120 },
    ]))
    expect(m.series).toEqual([100, 120, 150])
    expect(m.value).toBe(150)
  })

  it('ne trace aucune courbe sur un seul point — une ligne plate mentirait', () => {
    const m = buildKpi(withDim([{ month: '2026-08', n: 150 }]))
    expect(m.value).toBe(150)
    expect(m.series).toEqual([])
  })

  it('écarte les points non numériques sans décaler la série', () => {
    const m = buildKpi(withDim([
      { month: '2026-06', n: 100 }, { month: '2026-07', n: null }, { month: '2026-08', n: 150 },
    ]))
    expect(m.series).toEqual([100, 150])
    expect(m.previousLabel).toBe('2026-06')
  })
})

describe('la variation', () => {
  it('se dit en part de la valeur précédente', () => {
    expect(kpiDelta(120, 100)).toBeCloseTo(0.2)
    expect(kpiDelta(80, 100)).toBeCloseTo(-0.2)
  })

  // ⚠ Sur une base négative, c'est la VALEUR ABSOLUE qui sert de référence : sans elle, un
  // écart qui remonte de -100 à -50 s'annoncerait « -50 % » alors qu'il s'améliore.
  it('garde le bon sens sur une base négative', () => {
    expect(kpiDelta(-50, -100)).toBeCloseTo(0.5)
  })

  it('refuse de diviser par zéro plutôt que d’inventer un pourcentage', () => {
    expect(kpiDelta(42, 0)).toBeNull()
  })
})
