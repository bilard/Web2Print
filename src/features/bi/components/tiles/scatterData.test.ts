// ⚠⚠ Ce que ces tests protègent : une légende qui MENT. Une palette ne porte que dix
// teintes — les cycler ferait dire à deux catégories qu'elles sont la même — et reléguer
// une grosse catégorie dans « Autres » parce qu'elle arrive tard dans les lignes ferait
// disparaître l'essentiel du nuage sous un libellé fourre-tout.
import { describe, it, expect } from 'vitest'
import { buildScatter, MAX_SERIES } from './scatterData'
import type { AggregateResult } from '../../engine/aggregate'

const columns = (withLegend: boolean): AggregateResult['columns'] => ([
  { key: 'ref', labelKey: 'bi.dim.column', label: 'Référence', role: 'dimension' },
  ...(withLegend
    ? [{ key: 'band', labelKey: 'bi.dim.column', label: 'Position', role: 'dimension' as const }]
    : []),
  { key: 'price', labelKey: 'bi.agg.avg', label: 'Mon prix', role: 'measure', format: 'eur' },
  { key: 'gap', labelKey: 'bi.agg.median', label: 'Écart', role: 'measure', format: 'pct' },
] as AggregateResult['columns'])

describe('les deux mesures', () => {
  it('se tait plutôt que d’aligner les points quand il n’y en a qu’une', () => {
    const result: AggregateResult = {
      columns: columns(false).slice(0, 2) as AggregateResult['columns'],
      rows: [{ ref: 'a', price: 10 }],
    }
    expect(buildScatter(result, 'Autres')).toBeNull()
  })

  it('porte les valeurs BRUTES et le libellé du point', () => {
    const m = buildScatter({
      columns: columns(false), rows: [{ ref: 'A-1', price: 199.9, gap: -12 }],
    }, 'Autres')
    expect(m?.series[0].points[0]).toEqual({ x: 199.9, y: -12, label: 'A-1' })
  })
})

describe('la légende', () => {
  it('répartit les points par valeur de la SECONDE dimension', () => {
    const m = buildScatter({
      columns: columns(true),
      rows: [
        { ref: 'a', band: 'Moins cher', price: 10, gap: -5 },
        { ref: 'b', band: 'Aligné', price: 20, gap: 0 },
        { ref: 'c', band: 'Moins cher', price: 30, gap: -8 },
      ],
    }, 'Autres')
    expect(m?.series.map((s) => [s.label, s.points.length]))
      .toEqual([['Moins cher', 2], ['Aligné', 1]])
    // Deux catégories, deux teintes DISTINCTES : c'est tout ce que la légende promet.
    expect(m?.series[0].color).not.toBe(m?.series[1].color)
  })

  it('n’a qu’une série sans seconde dimension — et la palette n’y change rien', () => {
    const m = buildScatter({
      columns: columns(false), rows: [{ ref: 'a', price: 1, gap: 2 }, { ref: 'b', price: 3, gap: 4 }],
    }, 'Autres')
    expect(m?.series).toHaveLength(1)
    expect(m?.series[0].label).toBe('')
  })

  it('regroupe au-delà de dix catégories, en gardant les PLUS PEUPLÉES', () => {
    const rows = []
    for (let c = 0; c < 14; c++) {
      // La catégorie 13 est la plus peuplée mais arrive en DERNIER : elle doit garder sa teinte.
      const n = c === 13 ? 50 : c + 1
      for (let i = 0; i < n; i++) rows.push({ ref: `r${c}-${i}`, band: `c${c}`, price: i, gap: c })
    }
    const m = buildScatter({ columns: columns(true), rows }, 'Autres')
    expect(m?.series).toHaveLength(MAX_SERIES + 1)
    expect(m?.series[0].label).toBe('c13')
    expect(m?.series.at(-1)?.label).toBe('Autres')
    // Rien n'est perdu : les points regroupés sont bien là.
    expect(m?.series.reduce((n, s) => n + s.points.length, 0)).toBe(rows.length)
  })
})

describe('les lignes incomplètes', () => {
  it('les écarte au lieu de les poser à l’origine, et les COMPTE', () => {
    const m = buildScatter({
      columns: columns(false),
      rows: [{ ref: 'a', price: 10, gap: 1 }, { ref: 'b', price: null, gap: 2 }],
    }, 'Autres')
    expect(m?.series[0].points).toHaveLength(1)
    expect(m?.dropped).toBe(1)
  })
})
