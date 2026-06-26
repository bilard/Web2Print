import { describe, it, expect, vi } from 'vitest'

// Le module importe `db` (firebase) — on neutralise l'init pour tester le helper PUR.
vi.mock('@/lib/firebase/config', () => ({ db: {} }))

import { runDocToStates } from './runHistoryClient'

describe('runDocToStates — doc de run durable → états par node (réhydratation aperçu)', () => {
  it('mappe status + outputs par node', () => {
    const states = runDocToStates(
      { n1: 'success', n2: 'error' },
      { n1: { sheet: { rows: [{ a: 1 }] } } },
    )
    expect(states.n1).toEqual({ status: 'success', outputs: { sheet: { rows: [{ a: 1 }] } } })
    // node sans outputs : on garde son status (outputs undefined)
    expect(states.n2).toEqual({ status: 'error', outputs: undefined })
  })

  it('un node avec outputs mais absent de nodeStates → status « success » (robustesse)', () => {
    const states = runDocToStates({}, { n9: { sheet: { rows: [] } } })
    expect(states.n9).toEqual({ status: 'success', outputs: { sheet: { rows: [] } } })
  })

  it('entrées vides → objet vide (aucun run à montrer)', () => {
    expect(runDocToStates({}, {})).toEqual({})
  })
})
