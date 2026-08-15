// ⚠⚠ Ce que ces tests protègent : une alerte muette. Une tuile qui paraît calme parce
// qu'elle ne mesure RIEN fait croire qu'on surveille quelque chose — c'est pire que pas
// d'alerte du tout.
import { describe, it, expect } from 'vitest'
import { evaluateAlert } from './alert'
import type { AggregateResult } from './aggregate'

const result = (values: (number | null)[]): AggregateResult => ({
  columns: [
    { key: 'domain', labelKey: 'bi.dim.competitor', role: 'dimension' },
    { key: 'gap', labelKey: 'bi.measure.watchMedGap', role: 'measure', format: 'pct' },
  ],
  rows: values.map((v, i) => ({ domain: `s${i}.fr`, gap: v })),
})

describe('seuil d’une tuile', () => {
  it('s’allume sur le PIRE cas, pas sur la première ligne', () => {
    // Sans cela, l'alerte dépendrait de l'ordre de tri : trier autrement l'éteindrait.
    const r = evaluateAlert(result([2, 40, 5]), { op: 'gt', value: 30 })
    expect(r.breached).toBe(true)
    expect(r.value).toBe(40)
  })

  it('respecte le SENS du franchissement', () => {
    expect(evaluateAlert(result([2, 40]), { op: 'lt', value: 30 }).breached).toBe(true)
    expect(evaluateAlert(result([35, 40]), { op: 'lt', value: 30 }).breached).toBe(false)
  })

  it('reste INDÉCIDE quand rien n’est mesurable, jamais « calme »', () => {
    const r = evaluateAlert(result([null, null]), { op: 'gt', value: 0 })
    expect(r.undecided).toBe(true)
    expect(r.breached).toBe(false)
    expect(r.value).toBeNull()
  })

  it('ne conclut pas sans règle ni sans résultat', () => {
    expect(evaluateAlert(result([100]), undefined).undecided).toBe(true)
    expect(evaluateAlert(null, { op: 'gt', value: 0 }).undecided).toBe(true)
  })

  it('n’alerte pas sur l’ÉGALITÉ : le seuil doit être franchi, pas atteint', () => {
    expect(evaluateAlert(result([30]), { op: 'gt', value: 30 }).breached).toBe(false)
  })
})
