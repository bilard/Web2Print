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

// ⚠⚠ Régression T11 : poser une tuile (menu d'ajout) N'EST PAS un geste de glissement.
// `addPlacement` doit avancer `committed` immédiatement et vider les piles — sinon un
// `commit()` déclenché par un geste ultérieur pousserait la mise en page D'AVANT l'ajout sur
// la pile, et un `undo()` la referait persister avec une tuile désormais orpheline
// (présente dans `tiles`, absente de `layout`), ce que `parseDashboard` refuse.
describe('addPlacement — poser une tuile', () => {
  it("met à jour la mise en page SANS appeler `onCommit` (l'appelant persiste lui-même)", () => {
    const onCommit = vi.fn()
    const { result } = renderHook(() => useLayoutDraft(initial, onCommit))
    const withTile = [...initial, { tileId: 't2', x: 0, y: 2, w: 3, h: 2 }]
    act(() => result.current.addPlacement(withTile))
    expect(result.current.layout).toEqual(withTile)
    expect(onCommit).not.toHaveBeenCalled()
  })

  it("un geste puis un undo() après l'ajout ne fait PAS resurgir la mise en page d'avant l'ajout", () => {
    const onCommit = vi.fn()
    const { result } = renderHook(() => useLayoutDraft(initial, onCommit))
    const withTile = [...initial, { tileId: 't2', x: 0, y: 2, w: 3, h: 2 }]
    act(() => result.current.addPlacement(withTile))

    // Un geste de glissement sur la tuile existante, relâché.
    const dragged = withTile.map((l) => (l.tileId === 't1' ? { ...l, x: 4 } : l))
    act(() => result.current.setDraft(dragged))
    act(() => result.current.commit())
    expect(onCommit).toHaveBeenLastCalledWith(dragged)

    // `undo()` doit revenir à l'état posé par `addPlacement` (avec t2), jamais à `initial`
    // (sans t2) : sans le correctif, `onCommit` recevrait ici une mise en page orpheline.
    act(() => result.current.undo())
    expect(result.current.canUndo).toBe(false)
    expect(onCommit).toHaveBeenLastCalledWith(withTile)
  })

  it("l'ajout vide les piles d'annulation/rétablissement en cours", () => {
    const { result } = renderHook(() => useLayoutDraft(initial, vi.fn()))
    act(() => { result.current.setDraft([{ tileId: 't1', x: 4, y: 0, w: 3, h: 2 }]); result.current.commit() })
    expect(result.current.canUndo).toBe(true)

    act(() => result.current.addPlacement([...initial, { tileId: 't2', x: 0, y: 2, w: 3, h: 2 }]))
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
  })
})

// ⚠⚠ Régression : une version antérieure empilait `initial` (ou `layout`, déduits par
// égalité référentielle) au lieu du dernier état VALIDÉ. Après un re-rendu entre `setDraft`
// et `commit` — le cas normal, puisque chaque geste est un `act()` séparé ici comme dans un
// vrai glissement — un deuxième geste écrasait l'état intermédiaire : `undo()` sautait
// directement à l'état d'origine, sans jamais pouvoir revenir dessus par `redo()`.
describe('pile d’annulation — deux gestes ou plus', () => {
  const gestureA: TilePlacement[] = [{ tileId: 't1', x: 2, y: 0, w: 3, h: 2 }]
  const gestureB: TilePlacement[] = [{ tileId: 't1', x: 5, y: 0, w: 3, h: 2 }]

  // `setDraft` et `commit` en `act()` séparés : un re-rendu a bien lieu entre les deux,
  // comme entre le premier pixel déplacé et le relâchement.
  function commitGesture(result: { current: ReturnType<typeof useLayoutDraft> }, placement: TilePlacement[]) {
    act(() => result.current.setDraft(placement))
    act(() => result.current.commit())
  }

  it('un premier undo() après deux gestes ramène à l’état du PREMIER geste, pas à l’origine', () => {
    const { result } = renderHook(() => useLayoutDraft(initial, vi.fn()))
    commitGesture(result, gestureA)
    commitGesture(result, gestureB)
    act(() => result.current.undo())
    expect(result.current.layout[0].x).toBe(gestureA[0].x)
  })

  it('un second undo() ramène ensuite à l’état d’origine', () => {
    const { result } = renderHook(() => useLayoutDraft(initial, vi.fn()))
    commitGesture(result, gestureA)
    commitGesture(result, gestureB)
    act(() => result.current.undo())
    act(() => result.current.undo())
    expect(result.current.layout[0].x).toBe(initial[0].x)
  })

  it('undo() puis redo() retrouve l’état du second geste', () => {
    const { result } = renderHook(() => useLayoutDraft(initial, vi.fn()))
    commitGesture(result, gestureA)
    commitGesture(result, gestureB)
    act(() => result.current.undo())
    act(() => result.current.redo())
    expect(result.current.layout[0].x).toBe(gestureB[0].x)
  })

  it('un nouveau geste après undo() vide la pile de rétablissement', () => {
    const { result } = renderHook(() => useLayoutDraft(initial, vi.fn()))
    commitGesture(result, gestureA)
    commitGesture(result, gestureB)
    act(() => result.current.undo())
    expect(result.current.canRedo).toBe(true)
    commitGesture(result, gestureA)
    expect(result.current.canRedo).toBe(false)
  })

  it('commit() sans geste préalable ne fait rien', () => {
    const onCommit = vi.fn()
    const { result } = renderHook(() => useLayoutDraft(initial, onCommit))
    act(() => result.current.commit())
    expect(onCommit).not.toHaveBeenCalled()
    expect(result.current.canUndo).toBe(false)
  })
})
