// Horloge d'affichage : un « maintenant » qui VIEILLIT, pour que les âges affichés vieillissent.
//
// ⚠⚠ Sans elle, l'âge n'est calculé qu'au RENDU : un écran stable affiche « 0 s »
// indéfiniment. Un âge qui ne vieillit jamais est plus trompeur que pas d'âge du tout — il
// certifie une fraîcheur qu'il n'a pas vérifiée.
//
// ⚠ Elle bat dans le CADRE d'une tuile et dans le bandeau, jamais dans `TileBody` : c'est lui
// qui porte `useTileData`, et un état qui s'y rafraîchit relancerait l'agrégation de chaque
// tuile toutes les dix secondes.
import { useEffect, useState } from 'react'

/** Pas du battement. Dix secondes : l'affichage passe à la seconde sous une minute, et rien
 *  de plus fin n'est lisible au-delà. */
const AGE_TICK_MS = 10_000

export function useTickingNow(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    // Rien à faire vieillir tant qu'aucune donnée n'est arrivée : pas de minuterie inutile
    // sur les vingt tuiles d'un tableau en chargement.
    if (!enabled) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), AGE_TICK_MS)
    return () => clearInterval(id)
  }, [enabled])
  return now
}
