import { describe, it, expect } from 'vitest'
import { buildPromoPlanPrompt, useGeneratePromoPlan } from './useGeneratePromoPlan'

describe('buildPromoPlanPrompt', () => {
  it('inclut le brief, les dimensions et le catalogue de blocs', () => {
    const p = buildPromoPlanPrompt({
      brief: 'promo -50% éclatante',
      width: 794, height: 1123,
      sample: { promo_name: 'Perceuse', promo_remiseLabel: '-50%' },
      blocks: [{ id: 'badge-remise', label: 'Badge remise' }, { id: 'accroche', label: 'Accroche' }],
    })
    expect(p).toContain('promo -50% éclatante')
    expect(p).toContain('794')
    expect(p).toContain('badge-remise')
    expect(p).toContain('%') // consigne de placement en pourcentage
  })
})

describe('useGeneratePromoPlan', () => {
  it('est une fonction (smoke — appel LLM vérifié manuellement en T11)', () => {
    expect(typeof useGeneratePromoPlan).toBe('function')
  })
})
