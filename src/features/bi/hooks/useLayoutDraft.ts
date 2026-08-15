// La mise en page vit en état LOCAL pendant le geste et n'est persistée qu'au relâchement.
// Pile d'annulation bornée : cinquante gestes suffisent, et la mémoire reste plate.
//
// ⚠⚠ `committed` retient le dernier état VALIDÉ, EXPLICITEMENT — jamais déduit de `layout`
// (l'état affiché, qui peut être un brouillon non validé) ni de `initial` (l'état de
// montage, jamais mis à jour ensuite). Une version antérieure empilait `layout`/`initial` par
// déduction : après re-rendu entre `setDraft` et `commit` — donc toujours, en usage réel —
// `commit` empilait le mauvais état, et un deuxième geste rendait l'état intermédiaire
// irrécupérable, ni par `undo` ni par `redo`. `undo`/`redo` déplacent `committed` EN MÊME
// TEMPS que la pile : il n'y a qu'une seule source de vérité pour « l'état validé courant ».
import { useCallback, useRef, useState } from 'react'
import type { TilePlacement } from '../types'

const UNDO_MAX = 50

export function useLayoutDraft(initial: TilePlacement[], onCommit: (l: TilePlacement[]) => void) {
  const [layout, setLayout] = useState<TilePlacement[]>(initial)
  const committed = useRef<TilePlacement[]>(initial)
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
    past.current = [...past.current, committed.current].slice(-UNDO_MAX)
    future.current = []
    committed.current = next
    draft.current = null
    onCommit(next)
    force((n) => n + 1)
  }, [onCommit])

  const undo = useCallback(() => {
    const prev = past.current.at(-1)
    if (!prev) return
    past.current = past.current.slice(0, -1)
    future.current = [committed.current, ...future.current]
    committed.current = prev
    setLayout(prev)
    onCommit(prev)
    force((n) => n + 1)
  }, [onCommit])

  const redo = useCallback(() => {
    const next = future.current[0]
    if (!next) return
    future.current = future.current.slice(1)
    past.current = [...past.current, committed.current].slice(-UNDO_MAX)
    committed.current = next
    setLayout(next)
    onCommit(next)
    force((n) => n + 1)
  }, [onCommit])

  // ⚠⚠ Poser une tuile n'est PAS un geste de glissement : l'appelant (le menu d'ajout)
  // persiste lui-même le tableau de bord complet (tuiles + mise en page). Réutiliser
  // `setDraft` seul laisserait `committed` en retard d'un cran — un `commit()` déclenché
  // ensuite par un geste pousserait l'ancienne mise en page (SANS la tuile ajoutée) sur la
  // pile, et un `undo()` la referait persister : `parseDashboard` lèverait alors sur une
  // tuile orpheline (présente dans `tiles`, absente de `layout`). On fixe donc `committed`
  // au nouvel état ET on vide les piles : l'ajout d'une tuile n'est pas annulable au lot 1,
  // c'est honnête plutôt que de risquer un `undo()` qui casse l'écriture suivante.
  const commitLayout = useCallback((next: TilePlacement[]) => {
    draft.current = null
    committed.current = next
    past.current = []
    future.current = []
    setLayout(next)
    force((n) => n + 1)
  }, [])

  return {
    layout, setDraft, commit, undo, redo, commitLayout,
    canUndo: past.current.length > 0, canRedo: future.current.length > 0,
  }
}
