// La tuile RECONFIGURÉE s'affiche au geste, pas à l'écho de la base — et sa pile d'annulation.
//
// ⚠⚠ Même décalage que pour la pose d'une tuile (`usePendingTiles`) : entre le lâcher du
// champ et le retour de l'abonnement Firestore, `page.tiles` porte encore l'ANCIENNE
// requête. Sans surcharge locale, la puce apparaîtrait dans la zone pendant que la tuile
// continuerait d'afficher les chiffres d'avant — le geste semblerait n'avoir rien fait.
//
// ⚠⚠ Une écriture REFUSÉE retire la surcharge. Vu ailleurs dans ce dépôt : une écriture
// client sans règle Firestore échoue EN SILENCE ; garder la surcharge afficherait alors
// pour toujours une configuration qui n'existe dans aucune base.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/i18n'
import { saveDashboard } from '../store/dashboardsStore'
import { replacePage, type Dashboard, type Tile, type TilePlacement } from '../types'

/** Sérialisation STABLE : les clés d'un objet Firestore ne reviennent pas dans l'ordre où
 *  on les a écrites, et `undefined` n'y survit pas. Sans ça, aucune surcharge ne s'élaguerait. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
}

const sameTile = (a: Tile, b: Tile): boolean => canonical(a) === canonical(b)

interface EditsContext {
  uid: string | null
  current: Dashboard
  pageId: string
  /** Tuiles du document, DÉJÀ composées avec celles qu'on vient de poser. */
  tiles: Tile[]
  /** Mise en page COURANTE (le brouillon), lue À L'ÉCRITURE. ⚠⚠ Jamais celle de `current` :
   *  elle retarde d'un aller-retour Firestore, et écrire avec elle remettrait une tuile
   *  qu'on vient de déplacer à sa place d'avant (défaut vu en recette sur `setTileKind`). */
  layout: TilePlacement[]
}

export interface TileEdits {
  /** Tuiles du document, surchargées de celles qu'on vient de reconfigurer. ⚠ Rendues PAR
   *  IDENTITÉ quand rien n'est surchargé : `DashboardGrid` mémoïse sur cette référence. */
  tiles: Tile[]
  apply: (next: Tile) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}

export function useTileEdits({ uid, current, pageId, tiles, layout }: EditsContext): TileEdits {
  const { t } = useTranslation()
  const [overrides, setOverrides] = useState<Record<string, Tile>>({})
  const past = useRef<Tile[]>([])
  const future = useRef<Tile[]>([])
  const [, force] = useState(0)

  // L'écho revenu et conforme, la surcharge n'a plus lieu d'être. Comparaison AVANT
  // `setState` — sans elle, chaque rendu du parent en relancerait un autre.
  useEffect(() => {
    setOverrides((prev) => {
      const keys = Object.keys(prev)
      if (keys.length === 0) return prev
      const next: Record<string, Tile> = {}
      for (const k of keys) {
        const doc = tiles.find((x) => x.id === k)
        if (!doc || !sameTile(doc, prev[k])) next[k] = prev[k]
      }
      return Object.keys(next).length === keys.length ? prev : next
    })
  }, [tiles])

  const composed = useMemo(() => {
    if (Object.keys(overrides).length === 0) return tiles
    return tiles.map((x) => overrides[x.id] ?? x)
  }, [tiles, overrides])

  const drop = useCallback((tileId: string) => {
    setOverrides((prev) => {
      if (!(tileId in prev)) return prev
      const next = { ...prev }
      delete next[tileId]
      return next
    })
  }, [])

  /** Pose la surcharge PUIS écrit. ⚠ `t` hors dépendances : fermeture recréée à chaque rendu. */
  const write = useCallback((next: Tile) => {
    if (!uid) { toast.error(t('bi.save.failed')); return }
    setOverrides((prev) => ({ ...prev, [next.id]: next }))
    const tilesNext = composed.map((x) => (x.id === next.id ? next : x))
    saveDashboard(uid, replacePage(current, pageId, { tiles: tilesNext, layout }))
      .catch((e: unknown) => {
        drop(next.id)
        toast.error(e instanceof Error ? e.message : t('bi.save.failed'))
      })
  }, [uid, current, pageId, composed, layout, drop])

  const apply = useCallback((next: Tile) => {
    const before = composed.find((x) => x.id === next.id)
    if (!before || sameTile(before, next)) return
    past.current = [...past.current, before].slice(-50)
    future.current = []
    write(next)
    force((n) => n + 1)
  }, [composed, write])

  const step = useCallback((from: 'past' | 'future') => {
    const stack = from === 'past' ? past : future
    const other = from === 'past' ? future : past
    const target = from === 'past' ? stack.current.at(-1) : stack.current[0]
    if (!target) return
    const before = composed.find((x) => x.id === target.id)
    if (!before) return
    stack.current = from === 'past' ? stack.current.slice(0, -1) : stack.current.slice(1)
    other.current = from === 'past' ? [before, ...other.current] : [...other.current, before]
    write(target)
    force((n) => n + 1)
  }, [composed, write])

  const undo = useCallback(() => step('past'), [step])
  const redo = useCallback(() => step('future'), [step])

  return {
    tiles: composed, apply, undo, redo,
    canUndo: past.current.length > 0, canRedo: future.current.length > 0,
  }
}
