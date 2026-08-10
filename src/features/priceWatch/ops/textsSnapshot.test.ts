import { describe, it, expect } from 'vitest'
import { textsSnapshot } from './textsSnapshot'

const unit = (kind: 'translate' | 'improve', text: string) =>
  ({ plan: { kind }, text } as Parameters<typeof textsSnapshot>[0]['units'][number])

describe('textsSnapshot', () => {
  it('ventile les unités par nature de travail', () => {
    const s = textsSnapshot({
      units: [unit('translate', 'Bohrmaschine mit Schlagfunktion'), unit('improve', 'Perceuse')],
      considered: 100, alreadyDone: 80, done: 0, startedAt: 5, now: 5, origin: 'client',
    })
    expect(s.pending).toEqual({ translate: 1, improve: 1 })
    expect(s.total).toBe(2)
  })

  it('ventile les langues des seules unités à TRADUIRE', () => {
    const s = textsSnapshot({
      units: [unit('translate', 'Bohrmaschine mit Schlagfunktion und Koffer'), unit('improve', 'Perceuse à percussion')],
      considered: 2, alreadyDone: 0, done: 0, startedAt: 5, now: 5, origin: 'client',
    })
    expect(s.byLang?.reduce((n, l) => n + l.count, 0)).toBe(1)
  })

  it('omet la ventilation par motif quand la source ne la donne pas', () => {
    const s = textsSnapshot({
      units: [], considered: 0, alreadyDone: 0, done: 0, startedAt: 5, now: 5, origin: 'server',
    })
    expect(s.reasons).toBeUndefined()
  })

  it('porte la ventilation par motif quand elle est fournie', () => {
    const s = textsSnapshot({
      units: [], considered: 0, alreadyDone: 0, done: 0, startedAt: 5, now: 5, origin: 'server',
      reasons: { fresh: 12, stale: 3 },
    })
    expect(s.reasons).toEqual({ fresh: 12, stale: 3 })
  })
})
