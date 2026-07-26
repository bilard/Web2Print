import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/firebase/config', () => ({ db: {} }))
vi.mock('@/stores/auth.store', () => ({ useAuthStore: { getState: () => ({ user: null }) } }))

import { buildPipelineRunDoc, MAX_STEPS, MAX_STEP_CHARS } from './pipelineLog'

describe('buildPipelineRunDoc', () => {
  it('garde les DERNIÈRES étapes quand le run dépasse MAX_STEPS', () => {
    const steps = Array.from({ length: 100 }, (_, i) => `étape ${i}`)
    const doc = buildPipelineRunDoc(
      { module: 'enrichment', label: 'Produit X', status: 'success', durationMs: 1234.6, steps },
      'uid-1',
      1_700_000_000_000,
    )
    const out = doc.steps as string[]
    expect(out).toHaveLength(MAX_STEPS)
    expect(out[out.length - 1]).toBe('étape 99')
    expect(out[0]).toBe(`étape ${100 - MAX_STEPS}`)
  })

  it('tronque chaque étape et le message d’erreur', () => {
    const doc = buildPipelineRunDoc(
      {
        module: 'decompose', label: 'x'.repeat(500), status: 'error',
        durationMs: 10, steps: ['y'.repeat(1000)], error: 'e'.repeat(2000),
      },
      'uid-1',
      0,
    )
    expect((doc.steps as string[])[0]).toHaveLength(MAX_STEP_CHARS + 1) // + ellipse
    expect((doc.error as string)).toHaveLength(500)
    expect((doc.label as string)).toHaveLength(200)
    expect(doc.durationMs).toBe(10)
    expect(doc.ownerId).toBe('uid-1')
  })

  it('omet error/meta absents et arrondit la durée', () => {
    const doc = buildPipelineRunDoc(
      { module: 'enrichment', label: 'p', status: 'success', durationMs: 99.4 },
      'u',
      1,
    )
    expect('error' in doc).toBe(false)
    expect('meta' in doc).toBe(false)
    expect(doc.durationMs).toBe(99)
    expect(doc.steps).toEqual([])
  })
})
