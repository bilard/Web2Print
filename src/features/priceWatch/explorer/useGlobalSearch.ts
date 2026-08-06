// Balayage de TOUS les concurrents pour une saisie donnée.
//
// Déclenché À LA DEMANDE, jamais automatiquement : lire les index de vingt-quatre sites
// représente des centaines de milliers de fiches et plusieurs secondes de réseau. Ce
// n'est pas un coût qu'on impose à chaque frappe — mais c'est un coût acceptable quand
// l'utilisateur cherche une référence précise et que le site affiché ne l'a pas.
//
// Les sites sont parcourus UN PAR UN et chaque index est relâché aussitôt analysé :
// l'onglet ne tient jamais plus d'un catalogue concurrent à la fois, exactement comme
// l'affichage normal.
import { useCallback, useRef, useState } from 'react'
import { loadAllListings } from '../catalog/store'
import { scanSite, type GlobalHit, type GlobalSearchSite } from './globalSearch'
import { debugLog } from '@/lib/debugLog'

export interface GlobalSearchState {
  running: boolean
  /** Sites déjà analysés / total — la progression d'un balayage qui dure. */
  done: number
  total: number
  hits: GlobalHit[]
  /** Vrai une fois le balayage terminé, même sans résultat : « rien trouvé » est une
   *  réponse, et elle ne doit pas se confondre avec « pas encore cherché ». */
  finished: boolean
  error: string | null
}

const IDLE: GlobalSearchState = { running: false, done: 0, total: 0, hits: [], finished: false, error: null }

export function useGlobalSearch(uid: string | null, watchId: string | null) {
  const [state, setState] = useState<GlobalSearchState>(IDLE)
  // Un balayage en cours doit pouvoir être abandonné : l'utilisateur change de site ou
  // relance une autre recherche avant la fin.
  const runId = useRef(0)

  const reset = useCallback(() => { runId.current++; setState(IDLE) }, [])

  const run = useCallback(async (q: string, sites: GlobalSearchSite[]) => {
    if (!uid || !watchId || !q.trim() || sites.length === 0) return
    const id = ++runId.current
    setState({ running: true, done: 0, total: sites.length, hits: [], finished: false, error: null })
    const t0 = performance.now()
    for (const site of sites) {
      if (runId.current !== id) return // abandonné
      try {
        const listings = await loadAllListings(uid, watchId, site.siteId)
        if (runId.current !== id) return
        const hit = scanSite(site, listings, q)
        setState((s) => ({
          ...s,
          done: s.done + 1,
          // Les résultats s'affichent AU FIL DE L'EAU : sur vingt-quatre sites, attendre
          // la fin pour montrer le premier donnerait un écran mort pendant dix secondes.
          hits: hit ? [...s.hits, hit] : s.hits,
        }))
      } catch (e) {
        if (runId.current !== id) return
        console.error('[pw-explorer] balayage global : site illisible', site.domain, e)
        setState((s) => ({ ...s, done: s.done + 1 }))
      }
    }
    if (runId.current !== id) return
    setState((s) => ({ ...s, running: false, finished: true }))
    debugLog('[pw-explorer] balayage global terminé en', Math.round(performance.now() - t0), 'ms')
  }, [uid, watchId])

  return { ...state, run, reset }
}
