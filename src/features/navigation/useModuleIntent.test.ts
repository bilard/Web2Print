import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useModuleIntentStore } from '@/stores/moduleIntent.store'
import { useModuleIntent } from './useModuleIntent'

describe('moduleIntent store', () => {
  beforeEach(() => useModuleIntentStore.setState({ intent: null, seq: 0 }))

  it('incrémente seq à chaque set, même valeur identique', () => {
    const { set } = useModuleIntentStore.getState()
    set('dam:tab:favorites')
    const s1 = useModuleIntentStore.getState().seq
    set('dam:tab:favorites')
    expect(useModuleIntentStore.getState().seq).toBe(s1 + 1)
  })
})

describe('useModuleIntent', () => {
  beforeEach(() => useModuleIntentStore.setState({ intent: null, seq: 0 }))

  it("applique l'action quand le préfixe correspond, puis consomme", () => {
    const apply = vi.fn()
    renderHook(() => useModuleIntent('dam', apply))
    act(() => { useModuleIntentStore.getState().set('dam:tab:favorites') })
    expect(apply).toHaveBeenCalledWith('tab:favorites')
    expect(useModuleIntentStore.getState().intent).toBeNull()
  })

  it("ignore un intent d'un autre préfixe", () => {
    const apply = vi.fn()
    renderHook(() => useModuleIntent('dam', apply))
    act(() => { useModuleIntentStore.getState().set('settings:tab:ai') })
    expect(apply).not.toHaveBeenCalled()
    expect(useModuleIntentStore.getState().intent).toBe('settings:tab:ai')
  })

  it('re-déclenche apply sur un intent identique consécutif', () => {
    const apply = vi.fn()
    renderHook(() => useModuleIntent('dam', apply))
    act(() => { useModuleIntentStore.getState().set('dam:tab:favorites') })
    act(() => { useModuleIntentStore.getState().set('dam:tab:favorites') })
    expect(apply).toHaveBeenCalledTimes(2)
  })
})
