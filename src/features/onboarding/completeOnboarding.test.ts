import { describe, it, expect, vi, beforeEach } from 'vitest'

const setDoc = vi.fn((..._a: unknown[]): Promise<void> => Promise.resolve())
const doc = vi.fn((..._a: unknown[]) => ({ _path: `users/${_a[2]}` }))
vi.mock('firebase/firestore', () => ({ setDoc: (...a: unknown[]) => setDoc(...a), doc: (...a: unknown[]) => doc(...a) }))
vi.mock('@/lib/firebase/config', () => ({ db: {} }))

import { completeOnboarding } from './completeOnboarding'

beforeEach(() => { setDoc.mockClear(); doc.mockClear() })

describe('completeOnboarding', () => {
  it('uid vide → aucune écriture (garde anti null→uid)', async () => {
    await completeOnboarding('')
    expect(setDoc).not.toHaveBeenCalled()
  })
  it('uid valide → setDoc merge { onboardingComplete: true }', async () => {
    await completeOnboarding('abc123')
    expect(setDoc).toHaveBeenCalledTimes(1)
    const [, payload, opts] = setDoc.mock.calls[0]
    expect(payload).toEqual({ onboardingComplete: true })
    expect(opts).toEqual({ merge: true })
  })
})
