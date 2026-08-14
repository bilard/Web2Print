// La mise en page vit en état LOCAL pendant le geste et n'est persistée qu'au relâchement.
// Pile d'annulation bornée : cinquante gestes suffisent, et la mémoire reste plate.
import { useCallback, useRef, useState } from 'react'
import type { TilePlacement } from '../types'

const UNDO_MAX = 50

export function useLayoutDraft(initial: TilePlacement[], onCommit: (l: TilePlacement[]) => void) {
  const [layout, setLayout] = useState<TilePlacement[]>(initial)
  const past = useRef<TilePlacement[][]>([])
  const future = useRef<TilePlacement[][]>([])
  const [, force] = useState(0)
  const draft = useRef<TilePlacement[] | null>(null)

  const setDraft = useCallback((next: TilePlacement[]) => {
    draft.current = next
    setLayout(next)
  }, [])

  const commit = useCallback(() => {
    const next = draft.current
    if (!next) return
    past.current = [...past.current, layout === next ? initial : layout].slice(-UNDO_MAX)
    future.current = []
    draft.current = null
    onCommit(next)
    force((n) => n + 1)
  }, [layout, initial, onCommit])

  const undo = useCallback(() => {
    const prev = past.current.at(-1)
    if (!prev) return
    past.current = past.current.slice(0, -1)
    future.current = [layout, ...future.current]
    setLayout(prev)
    onCommit(prev)
    force((n) => n + 1)
  }, [layout, onCommit])

  const redo = useCallback(() => {
    const next = future.current[0]
    if (!next) return
    future.current = future.current.slice(1)
    past.current = [...past.current, layout]
    setLayout(next)
    onCommit(next)
    force((n) => n + 1)
  }, [layout, onCommit])

  return {
    layout, setDraft, commit, undo, redo,
    canUndo: past.current.length > 0, canRedo: future.current.length > 0,
  }
}
