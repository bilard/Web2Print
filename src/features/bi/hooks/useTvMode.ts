// Mode TV : le tableau en plein écran, ses pages qui défilent toutes seules.
//
// ⚠⚠ L'état suit le PLEIN ÉCRAN, jamais l'inverse. L'utilisateur peut en sortir par Échap
// sans toucher à notre bouton : sans cet accord, l'écran resterait en mode TV — barre
// masquée, pages qui tournent — dans une fenêtre redevenue normale, sans moyen d'en sortir.
import { useCallback, useEffect, useRef, useState } from 'react'

/** Temps d'affichage d'une page. Assez long pour être lu de loin, assez court pour qu'on
 *  n'attende pas devant un écran mural. */
const PAGE_MS = 20_000

export interface TvMode {
  on: boolean
  enter: () => void
  exit: () => void
}

export function useTvMode(next: () => void, pageCount: number, intervalMs = PAGE_MS): TvMode {
  const [on, setOn] = useState(false)
  // ⚠ `next` est recréé à chaque rendu du tableau : le garder en référence évite de
  // relancer la minuterie sans arrêt — les pages ne tourneraient jamais.
  const nextRef = useRef(next)
  nextRef.current = next

  useEffect(() => {
    // Une seule page ne tourne pas : une minuterie qui rejoue la même page à l'infini
    // ferait clignoter l'écran sans rien apporter.
    if (!on || pageCount < 2) return
    const id = setInterval(() => nextRef.current(), intervalMs)
    return () => clearInterval(id)
  }, [on, pageCount, intervalMs])

  useEffect(() => {
    const sync = () => { if (!document.fullscreenElement) setOn(false) }
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  const enter = useCallback(() => {
    // ⚠ Le plein écran peut être REFUSÉ (geste non reconnu, réglage du navigateur) : on
    // passe quand même en mode TV plutôt que de ne rien faire au clic — l'écran s'épure et
    // les pages défilent, ce que l'utilisateur venait chercher.
    document.documentElement.requestFullscreen?.().catch(() => {})
    setOn(true)
  }, [])

  const exit = useCallback(() => {
    setOn(false)
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
  }, [])

  return { on, enter, exit }
}
