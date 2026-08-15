// ⚠⚠ Ce que ces tests protègent : un écran mural bloqué. Le mode TV masque la barre et fait
// tourner les pages ; s'il survit à la sortie du plein écran, l'utilisateur se retrouve dans
// une fenêtre normale sans barre ni moyen d'en sortir.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTvMode } from './useTvMode'

const setFullscreen = (el: Element | null) =>
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: el })

beforeEach(() => {
  vi.useFakeTimers()
  document.documentElement.requestFullscreen = vi.fn().mockResolvedValue(undefined)
  document.exitFullscreen = vi.fn().mockResolvedValue(undefined)
  setFullscreen(null)
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('mode TV', () => {
  it('fait tourner les pages tant qu’il est actif, et s’arrête en sortant', () => {
    const next = vi.fn()
    const { result } = renderHook(() => useTvMode(next, 3, 1000))
    act(() => { result.current.enter() })
    act(() => { vi.advanceTimersByTime(3000) })
    expect(next).toHaveBeenCalledTimes(3)

    act(() => { result.current.exit() })
    act(() => { vi.advanceTimersByTime(5000) })
    expect(next).toHaveBeenCalledTimes(3)
  })

  it('ne fait pas tourner un tableau d’UNE seule page', () => {
    // Rejouer la même page à l'infini ferait clignoter l'écran sans rien apporter.
    const next = vi.fn()
    const { result } = renderHook(() => useTvMode(next, 1, 1000))
    act(() => { result.current.enter() })
    act(() => { vi.advanceTimersByTime(5000) })
    expect(next).not.toHaveBeenCalled()
  })

  it('quitte le mode quand on sort du plein écran par Échap', () => {
    const { result } = renderHook(() => useTvMode(vi.fn(), 2, 1000))
    act(() => { result.current.enter() })
    expect(result.current.on).toBe(true)
    act(() => {
      setFullscreen(null)
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    expect(result.current.on).toBe(false)
  })

  it('passe quand même en mode TV si le plein écran est REFUSÉ', () => {
    // Sans cela, un navigateur qui refuse le plein écran donnerait un bouton qui ne fait rien.
    document.documentElement.requestFullscreen = vi.fn().mockRejectedValue(new Error('refusé'))
    const { result } = renderHook(() => useTvMode(vi.fn(), 2, 1000))
    act(() => { result.current.enter() })
    expect(result.current.on).toBe(true)
  })
})
