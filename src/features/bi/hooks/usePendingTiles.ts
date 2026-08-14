// Compose les tuiles du document avec celles qui viennent d'être posées et dont l'écho
// Firestore n'est pas encore revenu.
//
// ⚠⚠ Sans cette composition, l'ajout d'une tuile se faisait en DEUX rendus : la mise en page
// portait déjà le placement, la liste des tuiles pas encore la tuile. `react-grid-layout`
// élaguait alors ce placement orphelin de son état interne, puis, l'écho arrivé, repartait
// de son état élagué et reposait la tuile en 1×1 tout en bas — les tailles de départ par
// type n'étaient jamais respectées. Pire : l'événement de mise en page émis dans la foulée
// armait le brouillon, et le premier glissement suivant PERSISTAIT cette mise en page
// dégénérée.
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Tile } from '../types'

export interface PendingTiles {
  /** Document + tuiles en attente. ⚠ Rend `tiles` PAR IDENTITÉ quand rien n'est en attente :
   *  `DashboardGrid` mémoïse sur cette référence, et une liste fraîche à chaque rendu ferait
   *  refaire son agrégation à chaque frame de glissement. */
  tiles: Tile[]
  /** À appeler dans le MÊME gestionnaire que la pose du placement : React regroupe les deux
   *  en un seul rendu, et la grille reçoit la tuile et sa place ensemble. */
  add: (tile: Tile) => void
}

export function usePendingTiles(tiles: Tile[]): PendingTiles {
  const [pending, setPending] = useState<Tile[]>([])

  // L'écho revenu, la tuile en attente n'a plus lieu d'être : on l'élague. Comparaison avant
  // `setState` — sans elle, chaque rendu du parent en relancerait un autre.
  useEffect(() => {
    setPending((p) => {
      if (p.length === 0) return p
      const known = new Set(tiles.map((t) => t.id))
      const rest = p.filter((t) => !known.has(t.id))
      return rest.length === p.length ? p : rest
    })
  }, [tiles])

  const composed = useMemo(() => {
    if (pending.length === 0) return tiles
    const known = new Set(tiles.map((t) => t.id))
    const fresh = pending.filter((t) => !known.has(t.id))
    return fresh.length ? [...tiles, ...fresh] : tiles
  }, [tiles, pending])

  const add = useCallback((tile: Tile) => setPending((p) => [...p, tile]), [])

  return { tiles: composed, add }
}
