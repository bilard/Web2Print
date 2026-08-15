// UNE flèche « annuler » pour DEUX piles : la mise en page et la configuration des champs.
//
// ⚠⚠ Les deux gestes ne peuvent pas partager une pile : `useLayoutDraft` empile des mises en
// page, `useTileEdits` des tuiles, et la première documente longuement pourquoi son état
// validé ne se déduit de rien. Fusionner les deux rouvrirait ce défaut. On tient donc un
// JOURNAL D'ORDRE — juste la nature de chaque geste — et on délègue à la bonne pile. C'est
// l'ordre CHRONOLOGIQUE que l'utilisateur attend des flèches, pas deux historiques parallèles.
import { useCallback, useRef, useState } from 'react'
import type { TilePlacement } from '../types'
import type { TileEdits } from './useTileEdits'

type Step = 'layout' | 'query'

interface HistoryContext {
  /** Les rappels de `useLayoutDraft`, un par un : l'objet qu'il rend est recréé à chaque rendu. */
  setDraft: (l: TilePlacement[]) => void
  commit: () => void
  commitLayout: (l: TilePlacement[]) => void
  layoutUndo: () => void
  layoutRedo: () => void
  canLayoutUndo: boolean
  canLayoutRedo: boolean
  edits: TileEdits
}

export function useBuilderHistory(ctx: HistoryContext) {
  const {
    setDraft, commit, commitLayout, layoutUndo, layoutRedo,
    canLayoutUndo, canLayoutRedo, edits,
  } = ctx
  const past = useRef<Step[]>([])
  const future = useRef<Step[]>([])
  // ⚠ `react-grid-layout` émet une mise en page au MONTAGE, sans le moindre geste : sans ce
  // témoin, chaque montage inscrirait au journal une étape que la pile ne porte pas, et la
  // flèche « annuler » s'allumerait pour ne rien faire.
  const armed = useRef(false)
  const [, force] = useState(0)

  const onDrag = useCallback((l: TilePlacement[]) => {
    armed.current = true
    setDraft(l)
  }, [setDraft])

  const onCommit = useCallback(() => {
    if (!armed.current) return
    armed.current = false
    commit()
    past.current = [...past.current, 'layout' as Step].slice(-50)
    future.current = []
    force((n) => n + 1)
  }, [commit])

  /**
   * Pose d'une tuile. ⚠⚠ `useLayoutDraft.commitLayout` VIDE ses piles (voir son commentaire :
   * un `undo` après un ajout ferait persister une mise en page sans la tuile, et
   * `parseDashboard` lèverait sur une tuile orpheline). Le journal doit donc être vidé avec,
   * sinon ses étapes « layout » désigneraient une pile qui ne les porte plus.
   */
  const onCommitLayout = useCallback((l: TilePlacement[]) => {
    past.current = []
    future.current = []
    armed.current = false
    commitLayout(l)
    force((n) => n + 1)
  }, [commitLayout])

  const note = useCallback(() => {
    past.current = [...past.current, 'query' as Step].slice(-50)
    future.current = []
    force((n) => n + 1)
  }, [])

  const canStep = useCallback(
    (s: Step, dir: 'undo' | 'redo') => s === 'layout'
      ? (dir === 'undo' ? canLayoutUndo : canLayoutRedo)
      : (dir === 'undo' ? edits.canUndo : edits.canRedo),
    [canLayoutUndo, canLayoutRedo, edits.canUndo, edits.canRedo],
  )

  /** Dépile jusqu'à trouver une étape que sa pile sait vraiment rejouer. */
  const walk = useCallback((dir: 'undo' | 'redo') => {
    const from = dir === 'undo' ? past : future
    const to = dir === 'undo' ? future : past
    const log = [...from.current]
    while (log.length) {
      const step = dir === 'undo' ? log.pop() : log.shift()
      if (!step) break
      if (!canStep(step, dir)) continue
      if (step === 'layout') dir === 'undo' ? layoutUndo() : layoutRedo()
      else dir === 'undo' ? edits.undo() : edits.redo()
      from.current = log
      to.current = dir === 'undo' ? [step, ...to.current] : [...to.current, step]
      force((n) => n + 1)
      return
    }
    from.current = []
    force((n) => n + 1)
  }, [canStep, layoutUndo, layoutRedo, edits])

  const undo = useCallback(() => walk('undo'), [walk])
  const redo = useCallback(() => walk('redo'), [walk])

  return {
    onDrag, onCommit, onCommitLayout, note, undo, redo,
    canUndo: past.current.some((s) => canStep(s, 'undo')),
    canRedo: future.current.some((s) => canStep(s, 'redo')),
  }
}
