// ⚠⚠ Ce que ces tests protègent : une couleur qui bouge. Une teinte qui change d'un rendu à
// l'autre — ou quand on déplace une tuile — fait croire que la donnée a changé, et on perd
// le repère qui permet de retrouver « la tuile verte » dans une page dense.
import { describe, it, expect } from 'vitest'
import { PALETTE, paletteAt, accentOf } from './palette'
import { chartModel } from './chartData'
import type { AggregateResult } from '../../engine/aggregate'

describe('palette', () => {
  it('boucle sans jamais sortir de la palette, y compris sur un index négatif', () => {
    expect(paletteAt(0)).toBe(PALETTE[0])
    expect(paletteAt(PALETTE.length)).toBe(PALETTE[0])
    expect(PALETTE).toContain(paletteAt(-3))
  })

  it('donne la MÊME teinte au même identifiant, une autre à un identifiant voisin', () => {
    expect(accentOf('t_abc')).toBe(accentOf('t_abc'))
    expect(PALETTE).toContain(accentOf('t_abc'))
    // Deux tuiles créées à la suite ne doivent pas se confondre.
    const seeds = ['t_1', 't_2', 't_3', 't_4']
    expect(new Set(seeds.map(accentOf)).size).toBeGreaterThan(1)
  })
})

const result = (rows: number): AggregateResult => ({
  columns: [
    { key: 'domain', labelKey: 'bi.dim.competitor', role: 'dimension' },
    { key: 'count', labelKey: 'bi.measure.count', role: 'measure', format: 'int' },
  ],
  rows: Array.from({ length: rows }, (_, i) => ({ domain: `s${i}.fr`, count: rows - i })),
})

const model = (kind: Parameters<typeof chartModel>[1], rows: number) =>
  chartModel(result(rows), kind, (c) => c.key, new Set())

describe('couleur des séries', () => {
  it('colore PAR CATÉGORIE quand une seule série tient l’axe', () => {
    // Vingt-quatre barres du même indigo ne se distinguent que par leur hauteur.
    const bg = model('bar', 4).datasets[0].backgroundColor
    expect(Array.isArray(bg)).toBe(true)
    expect(bg).toEqual([PALETTE[0], PALETTE[1], PALETTE[2], PALETTE[3]])
  })

  it('garde une teinte unique sur une COURBE, où le multicolore serait illisible', () => {
    expect(typeof model('line', 4).datasets[0].backgroundColor).toBe('string')
  })

  it('garde une teinte unique par série dès qu’il y en a plusieurs', () => {
    // Sinon la légende ne voudrait plus rien dire.
    const r = result(3)
    r.columns.push({ key: 'other', labelKey: 'bi.measure.count', role: 'measure', format: 'int' })
    r.rows.forEach((row) => { row.other = 1 })
    const m = chartModel(r, 'bar', (c) => c.key, new Set())
    expect(m.datasets).toHaveLength(2)
    expect(typeof m.datasets[0].backgroundColor).toBe('string')
    expect(m.datasets[0].backgroundColor).not.toBe(m.datasets[1].backgroundColor)
  })
})
