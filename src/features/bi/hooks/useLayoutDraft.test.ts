import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useLayoutDraft } from './useLayoutDraft'
import type { TilePlacement } from '../types'

const initial: TilePlacement[] = [{ tileId: 't1', x: 0, y: 0, w: 3, h: 2 }]

describe('brouillon de mise en page', () => {
  it('n’ENREGISTRE PAS pendant le geste, seulement au relâchement', () => {
    // ⚠ Écrire à chaque pixel parcouru ferait tourner vingt tuiles branchées en direct à
    // chaque déplacement — et une écriture Firestore par image.
    const onCommit = vi.fn()
    const { result } = renderHook(() => useLayoutDraft(initial, onCommit))
    act(() => result.current.setDraft([{ tileId: 't1', x: 4, y: 0, w: 3, h: 2 }]))
    expect(onCommit).not.toHaveBeenCalled()
    act(() => result.current.commit())
    expect(onCommit).toHaveBeenCalledWith([{ tileId: 't1', x: 4, y: 0, w: 3, h: 2 }])
  })

  it('annule et refait le dernier geste', () => {
    const { result } = renderHook(() => useLayoutDraft(initial, vi.fn()))
    act(() => { result.current.setDraft([{ tileId: 't1', x: 4, y: 0, w: 3, h: 2 }]); result.current.commit() })
    act(() => result.current.undo())
    expect(result.current.layout[0].x).toBe(0)
    act(() => result.current.redo())
    expect(result.current.layout[0].x).toBe(4)
  })

  it('ne peut pas annuler avant le premier geste', () => {
    const { result } = renderHook(() => useLayoutDraft(initial, vi.fn()))
    expect(result.current.canUndo).toBe(false)
  })
})
