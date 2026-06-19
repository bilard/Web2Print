// src/features/navigation/useModuleIntent.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useModuleIntentStore } from '@/stores/moduleIntent.store'

describe('moduleIntent store', () => {
  beforeEach(() => useModuleIntentStore.setState({ intent: null, seq: 0 }))

  it("set met a jour l'intent et incremente seq", () => {
    useModuleIntentStore.getState().set('dam:tab:favorites')
    expect(useModuleIntentStore.getState().intent).toBe('dam:tab:favorites')
    expect(useModuleIntentStore.getState().seq).toBe(1)
  })

  it('incremente seq meme sur une valeur identique consecutive', () => {
    const { set } = useModuleIntentStore.getState()
    set('dam:tab:favorites')
    const s1 = useModuleIntentStore.getState().seq
    set('dam:tab:favorites')
    expect(useModuleIntentStore.getState().seq).toBe(s1 + 1)
  })

  it('set(null) efface la valeur', () => {
    useModuleIntentStore.getState().set('settings:tab:ai')
    useModuleIntentStore.getState().set(null)
    expect(useModuleIntentStore.getState().intent).toBeNull()
  })
})
