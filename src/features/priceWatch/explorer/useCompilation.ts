// Balayage de TOUS les concurrents pour rassembler ce qui reste à contrôler.
//
// Même discipline que la recherche transversale (`useGlobalSearch`), pour les mêmes
// raisons : À LA DEMANDE (c'est plusieurs secondes de réseau et des centaines de milliers
// de fiches), site par site, l'index de chacun RELÂCHÉ avant de passer au suivant. Seules
// les lignes suspectes sont conservées — quelques pour cent du volume lu.
import { useCallback, useRef, useState } from 'react'
import { loadAllListings } from '../catalog/store'
import { loadVisuals, urlKey } from '../visual/visualStore'
import { compileSite, COMPILE_CAP, type CompileOptions, type CompiledRow } from './compilation'
import type { SourceProduct } from '../catalog/match'
import { debugLog } from '@/lib/debugLog'

export interface CompilationSite {
  siteId: string
  domain: string
}

export interface CompilationState {
  running: boolean
  /** Sites analysés / total — la progression d'un balayage qui dure. */
  done: number
  total: number
  rows: CompiledRow[]
  /** Fiches LUES, tous sites confondus : dit ce que le balayage a réellement parcouru. */
  scanned: number
  /** Vrai une fois terminé, même sans résultat : « rien à contrôler » est une réponse. */
  finished: boolean
  /** Plafond atteint : la liste est TRONQUÉE, et l'écran doit le dire. */
  capped: boolean
  /** Concurrents dont l'index n'a pas pu être lu — les taire ferait passer une lecture
   *  ratée pour un site sans suspects. */
  failed: string[]
}

const IDLE: CompilationState = {
  running: false, done: 0, total: 0, rows: [], scanned: 0, finished: false, capped: false, failed: [],
}

export function useCompilation(uid: string | null, watchId: string | null) {
  const [state, setState] = useState<CompilationState>(IDLE)
  // Un balayage en cours doit pouvoir être abandonné : l'utilisateur ferme la compilation
  // ou en relance une autre avant la fin.
  const runId = useRef(0)

  const reset = useCallback(() => { runId.current++; setState(IDLE) }, [])

  const run = useCallback(async (
    sites: CompilationSite[], products: SourceProduct[], opts: CompileOptions,
  ) => {
    if (!uid || !watchId || sites.length === 0 || products.length === 0) return
    const id = ++runId.current
    setState({ ...IDLE, running: true, total: sites.length })
    const t0 = performance.now()
    let kept = 0
    for (const site of sites) {
      if (runId.current !== id) return // abandonné
      try {
        // Les deux lectures ensemble : l'index des fiches et les verdicts de PHOTOS du
        // même site. Ces derniers pèsent dans l'indice de fiabilité — les ignorer ferait
        // passer pour acquis un appariement que les images contredisent, et la compilation
        // l'écarterait alors qu'il est le plus douteux du lot.
        const [listings, visuals] = await Promise.all([
          loadAllListings(uid, watchId, site.siteId),
          loadVisuals(uid, watchId, site.siteId).catch(() => new Map()),
        ])
        if (runId.current !== id) return
        const found = compileSite(site, products, listings, opts,
          (url) => visuals.get(urlKey(url))?.verdict ?? null)
        // Le plafond se mesure sur le CUMUL : un seul site ne le franchit presque jamais,
        // c'est la somme de vingt-quatre qui fige l'onglet.
        const room = Math.max(0, COMPILE_CAP - kept)
        const slice = found.slice(0, room)
        kept += slice.length
        setState((s) => ({
          ...s,
          done: s.done + 1,
          scanned: s.scanned + listings.length,
          // Résultats AU FIL DE L'EAU : sur vingt-quatre sites, attendre la fin pour
          // afficher la première ligne donnerait un écran mort pendant dix secondes.
          rows: slice.length ? [...s.rows, ...slice] : s.rows,
          capped: s.capped || slice.length < found.length,
        }))
      } catch (e) {
        if (runId.current !== id) return
        console.error('[pw-explorer] compilation : site illisible', site.domain, e)
        setState((s) => ({ ...s, done: s.done + 1, failed: [...s.failed, site.domain] }))
      }
    }
    if (runId.current !== id) return
    setState((s) => ({ ...s, running: false, finished: true }))
    debugLog('[pw-explorer] compilation terminée en', Math.round(performance.now() - t0), 'ms')
  }, [uid, watchId])

  return { ...state, run, reset }
}
